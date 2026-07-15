import { type Request, type Response, type NextFunction } from "express";
import { verifyJWT } from "../lib/jwt";
import type { JWTPayload } from "../types";

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

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = header.split(" ")[1];
    const payload: JWTPayload = await verifyJWT(token);

    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      credits: payload.credits,
      photoUrl: payload.photoUrl,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}
