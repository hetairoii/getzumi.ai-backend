// __tests__/my-images.test.ts
import { GET as getMyImagesHandler } from '../app/api/my-images/route';
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

// Mock MongoDB
jest.mock('../lib/mongodb', () => {
    const mockToArray = jest.fn();
    const mockFind = jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        toArray: mockToArray,
    }));
    const mockCollection = {
        find: mockFind,
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

describe('My Images API Endpoint', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockCollection: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockFindResult: any;
    
    beforeEach(async () => {
        jest.clearAllMocks();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const client = await require('../lib/mongodb').default;
        mockCollection = client.db().collection();
        mockFindResult = mockCollection.find(); 
        
        // Mock toArray to return list of images
        mockFindResult.toArray.mockResolvedValue([
            { _id: 'img1', user_id: 'test-user-id', prompt: 'prompt 1', view_url: 'url1', created_at: new Date() },
            { _id: 'img2', user_id: 'test-user-id', prompt: 'prompt 2', view_url: 'url2', created_at: new Date() }
        ]);

        (jwt.verify as jest.Mock).mockReturnValue({ userId: 'test-user-id' });
    });

    it('should return 401 if no auth cookie is present', async () => {
        const req = {
            cookies: {
                get: jest.fn().mockReturnValue(undefined),
            },
        } as unknown as NextRequest;

        const res = await getMyImagesHandler(req);
        const data = await res.json();

        expect(res.status).toBe(401);
        expect(data.success).toBe(false);
        expect(data.message).toMatch(/Unauthorized/);
    });

    it('should return 401 if token is invalid', async () => {
        (jwt.verify as jest.Mock).mockImplementation(() => { throw new Error("Invalid token"); });

        const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'bad-token' }),
            },
        } as unknown as NextRequest;

        const res = await getMyImagesHandler(req);
        const data = await res.json();

        expect(res.status).toBe(401);
        expect(data.message).toMatch(/Invalid token/);
    });

    it('should fetch images for the correct user', async () => {
        const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'valid-token' }),
            },
            nextUrl: { origin: 'http://test.com' }
        } as unknown as NextRequest;

        const res = await getMyImagesHandler(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.images).toHaveLength(2);
        
        // Check if database was queried with correct user_id
        // The mock was called once in beforeEach (empty) and once in handler (with args)
        expect(mockCollection.find).toHaveBeenLastCalledWith(
            { user_id: 'test-user-id' }, 
            expect.objectContaining({ projection: expect.any(Object) })
        );
    });

    it('should return empty list if user has no images', async () => {
         mockFindResult.toArray.mockResolvedValue([]);

         const req = {
            cookies: {
                get: jest.fn().mockReturnValue({ value: 'valid-token' }),
            },
            nextUrl: { origin: 'http://test.com' }
        } as unknown as NextRequest;

        const res = await getMyImagesHandler(req);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.images).toHaveLength(0);
    });
});
