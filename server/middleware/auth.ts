import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
    user?: {
        userId: string;
    };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Unauthorized: Missing authentication token" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("CRITICAL: JWT_SECRET missing in backend environment!");
        return res.status(500).json({ error: "Internal Server Error" });
    }

    try {
        const payload = jwt.verify(token, secret) as { userId: string };
        req.user = { userId: payload.userId };
        next();
    } catch (err) {
        return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    }
}
