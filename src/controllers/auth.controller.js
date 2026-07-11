// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import db from "../models/mysql/index.js";

const TOKEN_EXPIRY = "2h";

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            role: user.role,
            name: user.name
        },
        process.env.JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
};

export async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await db.User.findOne({
            where: { email }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        if (user.is_active === 0) {
            return res.status(401).json({
                success: false,
                message: "Account is deactivated."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const token = generateToken(user);
        delete user.password_hash;

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    is_active: user.is_active
                }
            }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}

export async function getMe(req, res) {
    try {
        const userId = req.user.id;
        
        const user = await db.User.findByPk(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("GetMe error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}

export async function counsellorLogin(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = await db.User.findOne({
            where: { email, role: 'counsellor' }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Counsellor not found"
            });
        }

        if (user.is_active === 0) {
            return res.status(401).json({
                success: false,
                message: "Account is inactive."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const token = generateToken(user);
        delete user.password_hash;

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    is_active: user.is_active
                }
            }
        });

    } catch (error) {
        console.error("Counsellor login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
}

export async function changePassword(req, res) {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user.id;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Old password and new password are required."
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters."
            });
        }

        const user = await db.User.findByPk(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Old password is incorrect."
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await db.User.update(
            { password_hash: hashedPassword },
            { where: { id: userId } }
        );

        return res.status(200).json({
            success: true,
            message: "Password changed successfully."
        });

    } catch (error) {
        console.error("Change password error:", error);
        return res.status(500).json({
            success: false,
            message: "An internal error occurred."
        });
    }
}

// Setup token functions (simplified)
export async function verifySetupToken(req, res) {
    try {
        const { token } = req.query;
        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token is required"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.User.findByPk(decoded.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Invalid token"
            });
        }

        res.json({
            success: true,
            data: { valid: true, user }
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
}

export async function setupPassword(req, res) {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token and password are required."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.User.update(
            { password_hash: hashedPassword, is_active: 1 },
            { where: { id: decoded.id } }
        );

        res.json({
            success: true,
            message: "Password set successfully."
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
}

// src/controllers/auth.controller.js

export async function verifyCounsellorSetupToken(req, res) {
    try {
        const { token } = req.query;
        
        console.log("🔍 Verifying counsellor setup token:", token); // ✅ Debug

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token is required"
            });
        }

        // ✅ Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("✅ Token decoded:", decoded); // ✅ Debug

        // ✅ Find user
        const user = await db.User.findOne({
            where: { 
                id: decoded.id, 
                role: 'counsellor',
                is_deleted: 0
            }
        });

        console.log("👤 User found:", user); // ✅ Debug

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found. Please contact admin."
            });
        }

        // ✅ Return user data (without sensitive info)
        res.json({
            success: true,
            valid: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("❌ Verify counsellor token error:", error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                success: false,
                valid: false,
                message: "Link has expired. Please contact admin for a new link."
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                success: false,
                valid: false,
                message: "Invalid link. Please contact admin."
            });
        }
        
        res.status(400).json({
            success: false,
            valid: false,
            message: "Invalid or expired token"
        });
    }
}
// src/controllers/auth.controller.js

// src/controllers/auth.controller.js

export async function setupCounsellorPassword(req, res) {
    try {
        const { token, password } = req.body;

        console.log("🔑 Setting up counsellor password with token:", token); // ✅ Debug

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: "Token and password are required."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        // ✅ Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("✅ Token decoded for password setup:", decoded); // ✅ Debug

        // ✅ Find user
        const user = await db.User.findOne({
            where: { 
                id: decoded.id, 
                role: 'counsellor',
                is_deleted: 0
            }
        });

        console.log("👤 User found for password setup:", user); // ✅ Debug

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found. Please contact admin."
            });
        }

        // ✅ Hash and set password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.User.update(
            { 
                password_hash: hashedPassword, 
                is_active: 1 
            },
            { where: { id: decoded.id, role: 'counsellor' } }
        );

        console.log("✅ Password set successfully for user:", user.id); // ✅ Debug

        res.json({
            success: true,
            message: "Counsellor password set successfully. You can now login."
        });

    } catch (error) {
        console.error("❌ Setup counsellor password error:", error);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({
                success: false,
                message: "Link has expired. Please contact admin for a new link."
            });
        }
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(400).json({
                success: false,
                message: "Invalid link. Please contact admin."
            });
        }
        
        res.status(400).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
}