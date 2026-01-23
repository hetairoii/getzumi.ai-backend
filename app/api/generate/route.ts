import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { GeminiImageService } from '../../../lib/gemini';
import sharp from 'sharp';
import { Binary } from 'mongodb';

interface GenerateRequestBody {
    prompt: string;
    model?: string;
    input_images?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();
    const { prompt, model = "gemini-3-pro-image-preview", input_images = [] } = body;

    const apiKey = process.env.APIYI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "API Key not configured" }, { status: 500 });
    }

    // 1. Generate Images (4 candidates)
    const service = new GeminiImageService(apiKey);
    const result = await service.generateImages(prompt, model, input_images, 4);

    if (!result.success || !result.data || result.data.length === 0) {
      return NextResponse.json({ success: false, message: result.error }, { status: 502 });
    }

    // 2. Compress All Images
    const compressedImages = await Promise.all(result.data.map(buffer => 
        sharp(buffer)
            .jpeg({ quality: 70, mozjpeg: true })
            .toBuffer()
    ));

    // 3. Return candidates to frontend (Do NOT save to DB yet)
    // Convert to base64 for client preview
    const candidates = compressedImages.map(buf => `data:image/jpeg;base64,${buf.toString('base64')}`);

    return NextResponse.json({
      success: true,
      candidates: candidates,
      message: "Generated 4 candidates. Please select one to save."
    });

  } catch (error) {
    console.error(error);
    const msg = error instanceof Error ? error.message : "Start Error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}
