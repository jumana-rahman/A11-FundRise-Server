import { type Response } from "express";
import type { AuthRequest } from "../middleware/auth";
export declare function createCheckoutSession(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function verifySession(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function create(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function listByUser(req: AuthRequest, res: Response): Promise<void>;
export declare function listAll(req: AuthRequest, res: Response): Promise<void>;
