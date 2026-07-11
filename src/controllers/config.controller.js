// src/controllers/config.controller.js
import rawDb from "../config/db.js";

// ✅ Get all configs (exclude soft deleted)
export async function getAllConfigs(req, res) {
    try {
        const [configs] = await rawDb.query(
            'SELECT id, name, type, is_active, is_deleted, sort_order FROM config_values WHERE is_deleted = 0 ORDER BY type, sort_order, name'
        );
        
        // Group by type
        const grouped = {};
        configs.forEach(item => {
            if (!grouped[item.type]) {
                grouped[item.type] = [];
            }
            grouped[item.type].push(item);
        });
        
        res.json({
            success: true,
            data: grouped
        });
    } catch (error) {
        console.error("❌ Get configs error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch configs",
            error: error.message
        });
    }
}

// ✅ Get config by type (exclude soft deleted)
export async function getConfigByType(req, res) {
    try {
        const { type } = req.params;
        console.log("📥 Fetching config type:", type);
        
        const [configs] = await rawDb.query(
            'SELECT id, name, type, is_active, is_deleted, sort_order FROM config_values WHERE type = ? AND is_deleted = 0 ORDER BY sort_order, name',
            [type]
        );
        
        console.log("📊 Found configs:", configs?.length || 0);
        
        res.json({
            success: true,
            data: configs
        });
    } catch (error) {
        console.error("❌ Get config by type error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch configs",
            error: error.message
        });
    }
}

// ✅ Create config
export async function createConfig(req, res) {
    try {
        const { name, type, is_active = 1, sort_order = 0 } = req.body;
        
        console.log("📤 Creating config:", { name, type, is_active, sort_order, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Config name is required"
            });
        }
        if (!type || !type.trim()) {
            return res.status(400).json({
                success: false,
                message: "Config type is required"
            });
        }
        
        const trimmedName = name.trim();
        const trimmedType = type.trim();
        
        // Check if config already exists with same name and type (excluding soft deleted)
        const [existingRows] = await rawDb.query(
            'SELECT id FROM config_values WHERE name = ? AND type = ? AND is_deleted = 0',
            [trimmedName, trimmedType]
        );
        
        if (existingRows && existingRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Config with name "${trimmedName}" and type "${trimmedType}" already exists`
            });
        }
        
        const result = await rawDb.query(
            'INSERT INTO config_values (name, type, is_active, is_deleted, sort_order, user_id) VALUES (?, ?, ?, 0, ?, ?)',
            [trimmedName, trimmedType, is_active, sort_order, req.user.id]
        );
        
        // Get insert ID properly
        let insertId;
        if (Array.isArray(result) && result[0] && result[0].insertId) {
            insertId = result[0].insertId;
        } else if (result && result.insertId) {
            insertId = result.insertId;
        } else {
            const [lastInsert] = await rawDb.query('SELECT LAST_INSERT_ID() as id');
            insertId = lastInsert[0]?.id;
        }
        
        console.log("📥 Inserted config ID:", insertId);
        
        if (!insertId) {
            throw new Error("Failed to get inserted config ID");
        }
        
        const [newRows] = await rawDb.query(
            'SELECT id, name, type, is_active, is_deleted, sort_order FROM config_values WHERE id = ?',
            [insertId]
        );
        
        const newConfig = newRows[0];
        
        if (!newConfig) {
            throw new Error("Failed to retrieve newly created config");
        }
        
        console.log("✅ Config created successfully:", newConfig);
        
        res.status(201).json({
            success: true,
            message: "Config created successfully",
            data: newConfig
        });
    } catch (error) {
        console.error("❌ Create config error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create config",
            error: error.message
        });
    }
}

// ✅ Update config
export async function updateConfig(req, res) {
    try {
        const { id } = req.params;
        const { name, type, is_active, sort_order } = req.body;
        
        console.log("📤 Updating config:", { id, name, type, is_active, sort_order, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Config name is required"
            });
        }
        if (!type || !type.trim()) {
            return res.status(400).json({
                success: false,
                message: "Config type is required"
            });
        }
        
        const trimmedName = name.trim();
        const trimmedType = type.trim();
        
        // Check if config exists and not deleted
        const [existingRows] = await rawDb.query(
            'SELECT id FROM config_values WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Config not found"
            });
        }
        
        // Check if another config has the same name and type
        const [duplicateRows] = await rawDb.query(
            'SELECT id FROM config_values WHERE name = ? AND type = ? AND id != ? AND is_deleted = 0',
            [trimmedName, trimmedType, id]
        );
        
        if (duplicateRows && duplicateRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Another config with name "${trimmedName}" and type "${trimmedType}" already exists`
            });
        }
        
        await rawDb.query(
            'UPDATE config_values SET name = ?, type = ?, is_active = ?, sort_order = ? WHERE id = ?',
            [trimmedName, trimmedType, is_active, sort_order, id]
        );
        
        const [updatedRows] = await rawDb.query(
            'SELECT id, name, type, is_active, is_deleted, sort_order FROM config_values WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Config updated successfully",
            data: updatedRows[0]
        });
    } catch (error) {
        console.error("❌ Update config error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update config",
            error: error.message
        });
    }
}

// ✅ Soft Delete config (sets is_deleted = 1)
export async function deleteConfig(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Soft deleting config:", id, "user:", req.user.id, "role:", req.user.role);
        
        // Check if config exists and not already deleted
        const [existingRows] = await rawDb.query(
            'SELECT id, is_deleted FROM config_values WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Config not found or already deleted"
            });
        }
        
        // ✅ SOFT DELETE - Set is_deleted = 1 and is_active = 0
        await rawDb.query(
            'UPDATE config_values SET is_deleted = 1, is_active = 0 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Config deleted successfully",
            data: { id, is_deleted: 1, is_active: 0 }
        });
    } catch (error) {
        console.error("❌ Delete config error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete config",
            error: error.message
        });
    }
}

// ✅ Restore soft deleted config
export async function restoreConfig(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Restoring config:", id);
        
        const [existingRows] = await rawDb.query(
            'SELECT id FROM config_values WHERE id = ? AND is_deleted = 1',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Deleted config not found"
            });
        }
        
        // ✅ RESTORE - Set is_deleted = 0 and is_active = 1
        await rawDb.query(
            'UPDATE config_values SET is_deleted = 0, is_active = 1 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Config restored successfully",
            data: { id, is_deleted: 0, is_active: 1 }
        });
    } catch (error) {
        console.error("❌ Restore config error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to restore config",
            error: error.message
        });
    }
}