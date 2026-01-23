import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import jwt from 'jsonwebtoken';

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        let userId: string;
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key-change-me');
            userId = decoded.userId;
        } catch (e) {
            console.error(e);
             return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
        }

        const client = await clientPromise;
        const db = client.db(process.env.MONGO_DB_NAME || "zumidb");
        const collection = db.collection("generated_images");

        // Find images for this user. 
        // We project only necessary fields to reduce payload size. 
        // We do NOT return the full binary image data here, just the ID/URL.
        const images = await collection.find(
            { user_id: userId },
            { 
                projection: { 
                    prompt: 1, 
                    model: 1, 
                    created_at: 1
                },
                sort: { created_at: -1 } // Newest first
            }
        ).toArray();

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;

        const formattedImages = images.map(img => ({
            id: img._id.toString(),
            prompt: img.prompt,
            model: img.model,
            created_at: img.created_at,
            view_url: `${baseUrl}/api/view/${img._id.toString()}`
        }));

        return NextResponse.json({
            success: true,
            count: formattedImages.length,
            images: formattedImages
        });

    } catch (error) {
        console.error("Get My Images Error:", error);
        return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
    }
}
