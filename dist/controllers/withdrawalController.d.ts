import { type Response } from "express";
import type { AuthRequest } from "../middleware/auth";
export declare function getEarnings(req: AuthRequest, res: Response): Promise<void>;
export declare function create(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function listByCreator(req: AuthRequest, res: Response): Promise<void>;
export declare function listPending(req: AuthRequest, res: Response): Promise<void>;
export declare function listAll(req: AuthRequest, res: Response): Promise<void>;
export declare function approve(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
