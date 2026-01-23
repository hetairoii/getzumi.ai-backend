
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

        const { prompt, model, input_image } = await req.json();

        if (!prompt) {
            return NextResponse.json({ success: false, message: "Prompt is required" }, { status: 400 });
        }

        const apiKey = process.env.APIYI_API_KEY;
        const baseUrl = process.env.APIYI_BASE_URL || "https://api.apiyi.com";

        if (!apiKey) {
            return NextResponse.json({ success: false, message: "API Configuration Missing" }, { status: 500 });
        }

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
            return NextResponse.json({ success: false, message: "Provider Error" }, { status: 502 });
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
