import { type Response } from "express";
import type { AuthRequest } from "../middleware/auth";
export declare function create(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function listAll(req: AuthRequest, res: Response): Promise<void>;
export declare function resolve(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
