import { POST } from '../app/api/video/generate/route';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../lib/mongodb', () => {
    const mCollection = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'mock-id' }),
    };
    const mDb = { collection: jest.fn().mockReturnValue(mCollection) };
    const mClient = { db: jest.fn().mockReturnValue(mDb) };
    return Promise.resolve(mClient);
});

// Helper to create mock request
const createProRequest = (prompt: string, model: string = 'sora-2-pro') => {
    return {
        json: async () => ({ prompt, model }),
        cookies: {
            get: (name: string) => ({ value: 'valid-token' })
        }
    } as unknown as NextRequest;
};

describe('Sora 2 Pro Integration (Async API)', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.clearAllMocks();
        (jwt.verify as jest.Mock).mockReturnValue({ userId: 'user-123' });
        process.env.APIYI_API_KEY = 'test-key';
        jest.useFakeTimers(); 
    });

    afterEach(() => {
        global.fetch = originalFetch;
        jest.useRealTimers();
    });

    test('Should send correct FormData parameters for sora-2-pro', async () => {
        let capturedBody: FormData | null = null;
        global.fetch = jest.fn().mockImplementation(async (url, options) => {
             if (options.method === 'POST') {
                 capturedBody = options.body;
                 return { ok: true, json: async () => ({ id: 'task-test' }) };
             }
             // Returns complete immediately to stop loop
             return { ok: true, json: async () => ({ status: 'completed', url: 'http://vid.mp4' }) };
        });

        const req = createProRequest('Test prompt', 'sora-2-pro');
        await POST(req);

        expect(capturedBody).not.toBeNull();
        if (capturedBody) {
            expect(capturedBody.get('prompt')).toBe('Test prompt');
            expect(capturedBody.get('model')).toBe('sora-2-pro');
            expect(capturedBody.get('size')).toBe('1080x1920'); // Updated expectation based on my code
            expect(capturedBody.get('seconds')).toBe('10');  
        }
    });
});
