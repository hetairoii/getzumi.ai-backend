// __tests__/save-image.test.ts
import { POST as saveImageHandler } from '../app/api/save-image/route';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// Mock MongoDB
jest.mock('../lib/mongodb', () => {
    const mockInsertOne = jest.fn();
    const mockCollection = {
        insertOne: mockInsertOne,
    };
    const mockDb = {
        collection: jest.fn(() => mockCollection),
    };
    const mockClient = {
        db: jest.fn(() => mockDb),
    };
    return {
        __esModule: true,
        default: Promise.resolve(mockClient),
    };
});

jest.mock('jsonwebtoken');

describe('Save Image API Endpoint', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockCollection: any;
    
    beforeEach(async () => {
        jest.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const client = await require('../lib/mongodb').default;
        mockCollection = client.db().collection();
        
        mockCollection.insertOne.mockResolvedValue({ insertedId: 'new-image-id' });
        (jwt.verify as jest.Mock).mockReturnValue({ userId: 'test-user-id' });
    });

    it('should return 401 if no auth cookie is present', async () => {
        const req = {
            cookies: {
                get: jest.fn().mockReturnValue(undefined),
            },
            json: async () => ({}),
        } as unknown as NextRequest;

        const res = await saveImageHandler(req);
        const data = await res.json();

        expect(res.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.message).toMatch(/Authentication required/);
    });

    it('should return 401 if token is invalid', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error("Invalid token"); });

        const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'bad-token' }),
            },
            json: async () => ({}),
        } as unknown as NextRequest;

        const res = await saveImageHandler(req);
        const data = await res.json();

        expect(res.status).toBe(401);
        expect(data.message).toMatch(/Invalid session/);
    });

    it('should return 400 if required data is missing', async () => {
        const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'valid-token' }),
            },
            json: async () => ({ prompt: 'test' }), // Missing imageData
            // Mock URL for baseUrl check
            nextUrl: { origin: 'http://test.com' }
        } as unknown as NextRequest;

        const res = await saveImageHandler(req);
        expect(res.status).toBe(400);
    });

    it('should save image associated with userId if authenticated', async () => {
        const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'valid-token' }),
            },
            json: async () => ({ 
                prompt: 'test prompt', 
                model: 'test-model',
                imageData: 'data:image/png;base64,mockbase64data' 
            }),
            nextUrl: { origin: 'http://test.com' }
        } as unknown as NextRequest;

        const res = await saveImageHandler(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        
        // Very important: Check that user_id was passed to DB
        expect(mockCollection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 'test-user-id',
            prompt: 'test prompt'
        }));
    });
});
