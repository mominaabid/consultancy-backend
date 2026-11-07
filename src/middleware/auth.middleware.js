// src/middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import db from "../models/mysql/index.js";

export default async function auth(req, res, next) {
    try {
        const authHeader = req.headers["authorization"];
        let token = authHeader && authHeader.split(" ")[1];

        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await db.User.findByPk(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found. Please login again."
            });
        }

        if (user.is_active === 0) {
            return res.status(401).json({
                success: false,
                message: "Account is deactivated."
            });
        }

        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            is_active: user.is_active
        };
        
        next();
        
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: "Session expired. Please login again.",
                code: "TOKEN_EXPIRED"
            });
        }
        return res.status(401).json({
            success: false,
            message: "Invalid token. Please login again."
        });
    }
}

export function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized"
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Role ${req.user.role} is not authorized`
            });
        }
        
        next();
    };
}