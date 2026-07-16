import { type Response } from "express";
import type { AuthRequest } from "../middleware/auth";
export declare function listByUser(req: AuthRequest, res: Response): Promise<void>;
export declare function markRead(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function markAllRead(req: AuthRequest, res: Response): Promise<void>;
export declare function remove(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
