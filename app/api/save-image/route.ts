
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { Binary } from 'mongodb';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { prompt, model, imageData, input_images = [] } = body;

        if (!imageData || !prompt) {
            return NextResponse.json({ success: false, message: "Missing data" }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db(process.env.MONGO_DB_NAME || "zumidb");
        const collection = db.collection("generated_images");

        // Clean base64
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        // Process input images
        const storedInputImages = input_images.map((imgStr: string) => {
            const b64 = imgStr.replace(/^data:image\/\w+;base64,/, "");
            return new Binary(Buffer.from(b64, 'base64'));
        });

        const doc = {
            prompt,
            model,
            image_data: new Binary(buffer),
            input_images: storedInputImages,
            content_type: "image/jpeg",
            created_at: new Date(),
        };

        const insertResult = await collection.insertOne(doc);
        const imageId = insertResult.insertedId.toString();

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
        const viewUrl = `${baseUrl}/api/view/${imageId}`;

        return NextResponse.json({
            success: true,
            image_id: imageId,
            view_url: viewUrl
        });

    } catch (error) {
        console.error("Save Error", error);
        return NextResponse.json({ success: false, message: "Save failed" }, { status: 500 });
    }
}
