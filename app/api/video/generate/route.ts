
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';
import jwt from 'jsonwebtoken';

export async function POST(req: NextRequest) {
    try {
        const token = req.cookies.get('auth_token')?.value;
        if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

        let userId: string;
        try {
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-me');
            userId = decoded.userId;
        } catch (e) {
            return NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
        }

        const { prompt, model, input_image, input_images, seconds } = await req.json();

        if (!prompt) {
            return NextResponse.json({ success: false, message: "Prompt is required" }, { status: 400 });
        }

        const apiKey = process.env.APIYI_API_KEY;
        const baseUrl = process.env.APIYI_BASE_URL || "https://api.apiyi.com";

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "API Configuration Missing" }, { status: 500 });
        }

        // --- ASYNC API HANDLER (Sora 2 Pro, Sora 2 Async, Veo) ---
        // Docs: https://docs.laozhang.ai/en/api-capabilities/sora2/async-api
        // Docs: https://docs.laozhang.ai/en/api-capabilities/veo/veo-31-async-api
        if (model === "sora-2-pro" || model === "sora-2" || model.startsWith("veo-")) {
            try {
                // 1. Prepare FormData for Async API
                const formData = new FormData();
                formData.append("prompt", prompt);
                formData.append("model", model);

                // --- SORA SPECIFIC ---
                if (model.startsWith("sora-")) {
                    // Sora supports 'seconds' and 'size'
                    // Default to 1080x1920 for Pro if not specified, or just let API default? 
                    // Docs: size="1280x720", "720x1280".
                    // We will default to landscape 1280x720 if not provided, or respect user intent if we had a param.
                    formData.append("size", "1280x720"); 
                    
                    // Duration: "10", "15". 
                    // If user requests more, we pass it, but standard is 10/15.
                    if (seconds) {
                        formData.append("seconds", seconds.toString());
                    } else {
                        formData.append("seconds", "15");
                    }
                }

                // --- VEO SPECIFIC ---
                if (model.startsWith("veo-")) {
                    // Veo Docs DO NOT list 'seconds' or 'size' as params in the standard Async API table.
                    // We DO NOT append 'seconds' here to avoid 400 Bad Request.
                    // Veo models handle resolution via model name suffixes (e.g. -landscape).
                    
                    // Handle Image-to-Video Model Switching for Veo
                    const hasImages = (input_images && input_images.length > 0) || !!input_image;
                    if (hasImages && !model.includes("-fl")) {
                        // Switch to frame-loop (-fl) model if images provided but base model selected
                        // Example: veo-3.1-landscape -> veo-3.1-landscape-fl
                        // Example: veo-3.1 -> veo-3.1-fl
                        let newModel = model;
                         if (model.includes("-fast")) {
                            newModel = model.replace("-fast", "-fast-fl");
                        } else {
                            newModel = model + "-fl";
                        }
                        // Fix double suffix or invalid combos if needed (simple append works for standard names)
                        formData.set("model", newModel);
                    }
                }

                // --- IMAGE HANDLING (Common for Async) ---
                const imagesToProcess = input_images && input_images.length > 0 ? input_images : (input_image ? [input_image] : []);
                
                if (imagesToProcess.length > 0) {
                    for (let i = 0; i < imagesToProcess.length; i++) {
                        const b64 = imagesToProcess[i];
                        // Remove header if present (data:image/jpeg;base64,...)
                        const base64Data = b64.replace(/^data:image\/\w+;base64,/, "");
                        const buffer = Buffer.from(base64Data, 'base64');
                        const blob = new Blob([buffer], { type: 'image/jpeg' }); 
                        
                        // Parameter name is 'input_reference' for both Sora and Veo
                        formData.append("input_reference", blob, `ref_image_${i}.jpg`);
                    }
                }

                // 2. Submit Task
                console.log(`[Async] Submitting task for ${model}...`);
                const submitRes = await fetch(`${baseUrl}/v1/videos`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${apiKey}`
                        // Content-Type header is set automatically with boundary by FormData
                    },
                    body: formData
                });

                if (!submitRes.ok) {
                    const errText = await submitRes.text();
                    console.error("Async Submit Error:", errText);
                    return NextResponse.json({ success: false, message: "Provider Error: " + errText }, { status: 502 });
                }

                const submitData = await submitRes.json();
                const taskId = submitData.id;
                console.log(`[Async] Task created: ${taskId}`);

                // 3. Polling Logic (Stream)
                const encoder = new TextEncoder();
                const stream = new ReadableStream({
                    async start(controller) {
                        let isComplete = false;
                        let attempts = 0;
                        const maxAttempts = 300; // ~25 mins (5s interval) - Sora Pro can take 10+ mins
                        
                        while (!isComplete && attempts < maxAttempts) {
                            attempts++;
                            try {
                                const statusRes = await fetch(`${baseUrl}/v1/videos/${taskId}`, {
                                    headers: { 'Authorization': `Bearer ${apiKey}` }
                                });
                                
                                if (statusRes.ok) {
                                    const statusData = await statusRes.json();
                                    const state = statusData.status; 
                                    const progress = statusData.progress || (state === 'completed' ? 100 : 0);
                                    
                                    // Helper to send SSE
                                    const sendChunk = (text: string) => {
                                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                                            choices: [{ delta: { content: text } }] 
                                        })}\n\n`));
                                    };

                                    if (state !== 'completed' && state !== 'failed') {
                                        sendChunk(`Status: ${state} (Progress: ${progress}%)\n`);
                                    }

                                    if (state === 'completed') {
                                        isComplete = true;
                                        let videoUrl = statusData.url; 
                                        
                                        // If url missing in status, fetch /content
                                        if (!videoUrl) {
                                             const contentRes = await fetch(`${baseUrl}/v1/videos/${taskId}/content`, {
                                                 headers: { 'Authorization': `Bearer ${apiKey}` }
                                             });
                                             if (contentRes.ok) {
                                                 const contentData = await contentRes.json();
                                                 videoUrl = contentData.url;
                                             }
                                        }

                                        if (videoUrl) {
                                            sendChunk(`\n\nDONE: [Download Video](${videoUrl})`);
                                            
                                            // Save to MongoDB
                                            const client = await clientPromise;
                                            const db = client.db(process.env.MONGO_DB_NAME || "zumidb");
                                            await db.collection("generated_videos").insertOne({
                                                user_id: userId,
                                                prompt,
                                                model,
                                                video_url: videoUrl,
                                                created_at: new Date()
                                            });
                                        }
                                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                                    } else if (state === 'failed') {
                                        isComplete = true;
                                        const errorMsg = statusData.error?.message || "Unknown error";
                                        sendChunk(`\n\nError: Generation failed - ${errorMsg}`);
                                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                                    }
                                }
                            } catch (e) {
                                console.error("Polling Error:", e);
                            }

                            if (!isComplete) {
                                await new Promise(r => setTimeout(r, 5000));
                            }
                        }
                        
                        if (!isComplete) {
                             controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                                choices: [{ delta: { content: "\n\nTimeout: Generation took too long." } }] 
                            })}\n\n`));
                            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        }
                        controller.close();
                    }
                });

                return new NextResponse(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                    },
                });

            } catch (error) {
                console.error("Async Process Error:", error);
                return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
            }
        }
        
        // --- EXISTING SYNC HANDLER ---
        const messages: any[] = [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt }
                ]
            }
        ];

        if (input_image) {
            messages[0].content.push({
                type: "image_url",
                image_url: { url: input_image } // Expecting base64 data url or public url
            });
        }

        const apiRes = await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || "sora_video2",
                stream: true,
                messages: messages
            })
        });

        if (!apiRes.ok) {
            const err = await apiRes.text();
            console.error("APIYI Error:", err);
            try {
                const jsonErr = JSON.parse(err);
                return NextResponse.json({ success: false, message: jsonErr.error?.message || "Provider Error" }, { status: 502 });
            } catch (e) {
                return NextResponse.json({ success: false, message: "Provider Error" }, { status: 502 });
            }
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        
        let accumulatedText = "";

        const stream = new ReadableStream({
            async start(controller) {
                // @ts-ignore
                for await (const chunk of apiRes.body) {
                    const chunkText = decoder.decode(chunk);
                    accumulatedText += chunkText;
                    controller.enqueue(chunk);
                }
                controller.close();

                // Process final text to find URL and save to DB
                // The stream contains multiple "data: JSON" lines. We need to extract the "content" from them.
                try {
                    // Extract all "content" parts
                    const lines = accumulatedText.split('\n');
                    let fullContent = "";
                    for (const line of lines) {
                        if (line.trim().startsWith('data: ') && !line.includes('[DONE]')) {
                            try {
                                const jsonStr = line.replace('data: ', '').trim();
                                const json = JSON.parse(jsonStr);
                                if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                                    fullContent += json.choices[0].delta.content;
                                }
                            } catch (e) {
                                // Ignore parse errors for partial lines
                            }
                        }
                    }

                    console.log("Full Stream Content for Video:", fullContent);

                    // Regex to find URL in markdown: [click here](https://...) OR just a raw URL
                    // Pattern in docs: [click here](https://example.com/video.mp4)
                    let videoUrl = null;
                    const mdMatch = fullContent.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
                    if (mdMatch && mdMatch[1]) {
                        videoUrl = mdMatch[1];
                    } else {
                        // Fallback: Search for https URL
                        const rawMatch = fullContent.match(/(https?:\/\/[^\s]+)/);
                        if (rawMatch && rawMatch[1]) {
                             // Cleanup potential trailing chars like ) or ] or .
                             videoUrl = rawMatch[1].replace(/[)\]\.]+$/, "");
                        }
                    }

                    if (videoUrl) {
                        // Save to MongoDB
                        const client = await clientPromise;
                        const db = client.db(process.env.MONGO_DB_NAME || "zumidb");
                        await db.collection("generated_videos").insertOne({
                            user_id: userId,
                            prompt,
                            model: model || "sora_video2",
                            video_url: videoUrl,
                            created_at: new Date()
                        });
                        console.log("Video saved to DB:", videoUrl);
                    } else {
                        console.warn("No video URL found in stream content");
                    }

                } catch (err) {
                    console.error("Error processing video stream completion:", err);
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error("Video Generation Error:", error);
        return NextResponse.json({ success: false, message: "Server Error" }, { status: 500 });
    }
}
