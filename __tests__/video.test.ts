
import { POST } from '../app/api/video/generate/route';
import { GET } from '../app/api/my-videos/route';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import clientPromise from '../lib/mongodb';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../lib/mongodb', () => {
    const mCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
        find: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([
            { _id: '1', prompt: 'test video', video_url: 'http://video.com', created_at: new Date() }
        ])
    };
    const mDb = { collection: jest.fn().mockReturnValue(mCollection) };
    const mClient = { db: jest.fn().mockReturnValue(mDb) };
    return Promise.resolve(mClient);
});

// Mock environment variables
process.env.APIYI_API_KEY = "mock-key";
process.env.JWT_SECRET = "secret";

describe('Video API', () => {
    
    // Helper to create mock request with cookies
    const createRequest = (body: any, token: string = 'valid-token') => {
        return {
            json: async () => body,
            cookies: {
                get: (name: string) => ({ value: token })
            }
        } as unknown as NextRequest;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-123' });
    });

    // We can't easily mock the global fetch for ReadableStream in this environment without polyfills
    // So we will focus on testing the Auth and Validation logic, and the GET endpoint.

    test('POST /api/video/generate should fail without auth token', async () => {
        const req = {
            cookies: { get: () => undefined }
        } as unknown as NextRequest;
        
        const res = await POST(req);
        const data = await res.json();
        
        expect(res.status).toBe(401);
        expect(data.success).toBe(false);
    });

    test('POST /api/video/generate should fail without prompt', async () => {
        const req = createRequest({ model: 'sora' });
        const res = await POST(req);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.message).toBe("Prompt is required");
    });

    test('GET /api/my-videos should return user videos', async () => {
        const req = createRequest({});
        const res = await GET(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.videos).toHaveLength(1);
        expect(data.videos[0].prompt).toBe("test video");
    });

    test('GET /api/my-videos should fail with invalid token', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error(); });
        const req = createRequest({});
        const res = await GET(req);
        
        expect(res.status).toBe(401);
    });
});
