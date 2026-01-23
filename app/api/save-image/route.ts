
import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { Binary } from 'mongodb';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
    try {
        // 1. Check Authentication (Cookie)
        const token = request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ 
                success: false, 
                message: "Authentication required. Please sign in or register to save images." 
            }, { status: 401 });
        }

        let userId: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-me');
            userId = decoded.userId;
        } catch (e) {
            console.error("JWT Verification failed", e);
             return NextResponse.json({ 
                success: false, 
                message: "Invalid session. Please sign in again." 
            }, { status: 401 });
        }

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
            user_id: userId, // Associate image with user
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
