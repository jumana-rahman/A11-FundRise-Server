import { type Request, type Response, type NextFunction } from "express";
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: "supporter" | "creator" | "admin";
    credits: number;
    photoUrl: string;
}
export interface AuthRequest extends Request {
    user?: AuthUser;
}
export declare function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<Response<any, Record<string, any>> | undefined>;
export declare function requireRole(...roles: string[]): (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
