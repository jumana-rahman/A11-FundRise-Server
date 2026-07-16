import { type Response } from "express";
import type { AuthRequest } from "../middleware/auth";
export declare function create(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function listBySupporter(req: AuthRequest, res: Response): Promise<void>;
export declare function listPendingForCreator(req: AuthRequest, res: Response): Promise<void>;
export declare function listApprovedForSupporter(req: AuthRequest, res: Response): Promise<void>;
export declare function approve(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function reject(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function listByCampaign(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
