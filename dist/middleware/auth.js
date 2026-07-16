import { verifyJWT } from "../lib/jwt";
export async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ error: "Authentication required" });
        }
        const token = header.split(" ")[1];
        const payload = await verifyJWT(token);
        req.user = {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            role: payload.role,
            credits: payload.credits,
            photoUrl: payload.photoUrl,
        };
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication required" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Insufficient permissions" });
        }
        next();
    };
}
