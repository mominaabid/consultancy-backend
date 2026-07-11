// src/controllers/country.controller.js
import rawDb from "../config/db.js";

// ✅ Get all countries (exclude soft deleted)
export async function getCountries(req, res) {
    try {
        const isAdmin = req.user?.role === 'admin';
        let query = 'SELECT id, name, code, is_active, is_deleted, user_id, created_at, updated_at FROM countries WHERE is_deleted = 0';
        if (!isAdmin) {
            query += ' AND is_active = 1';
        }
        query += ' ORDER BY name';
        
        const [countries] = await rawDb.query(query);
        
        console.log("📥 Countries fetched:", countries?.length || 0);
        
        res.json({
            success: true,
            data: countries
        });
    } catch (error) {
        console.error("❌ Get countries error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch countries",
            error: error.message
        });
    }
}

// ✅ Get country by ID
export async function getCountryById(req, res) {
    try {
        const { id } = req.params;
        const [rows] = await rawDb.query(
            'SELECT id, name, code, is_active, is_deleted, user_id, created_at, updated_at FROM countries WHERE id = ? AND is_deleted = 0',
            [id]
        );
        const country = rows[0];
        
        if (!country) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }
        
        res.json({
            success: true,
            data: country
        });
    } catch (error) {
        console.error("❌ Get country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch country",
            error: error.message
        });
    }
}

// ✅ Create country
export async function createCountry(req, res) {
    try {
        const { name, code, is_active = 1 } = req.body;
        
        console.log("📤 Creating country:", { name, code, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Country name is required"
            });
        }
        if (!code || !code.trim()) {
            return res.status(400).json({
                success: false,
                message: "Country code is required"
            });
        }
        
        const trimmedName = name.trim();
        const trimmedCode = code.trim().toUpperCase();
        
        // Check if country already exists (including soft deleted)
        const [existingRows] = await rawDb.query(
            'SELECT id FROM countries WHERE (name = ? OR code = ?) AND is_deleted = 0',
            [trimmedName, trimmedCode]
        );
        
        if (existingRows && existingRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Country with this name or code already exists"
            });
        }
        
        // Insert the country
        const result = await rawDb.query(
            'INSERT INTO countries (name, code, is_active, is_deleted, user_id) VALUES (?, ?, ?, 0, ?)',
            [trimmedName, trimmedCode, is_active, req.user.id]
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
        
        console.log("📥 Inserted country ID:", insertId);
        
        if (!insertId) {
            throw new Error("Failed to get inserted country ID");
        }
        
        // Get the newly created country
        const [newRows] = await rawDb.query(
            'SELECT id, name, code, is_active, is_deleted, user_id, created_at, updated_at FROM countries WHERE id = ?',
            [insertId]
        );
        
        const newCountry = newRows[0];
        
        if (!newCountry) {
            throw new Error("Failed to retrieve newly created country");
        }
        
        console.log("✅ Country created successfully:", newCountry);
        
        res.status(201).json({
            success: true,
            message: "Country created successfully",
            data: newCountry
        });
    } catch (error) {
        console.error("❌ Create country error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create country",
            error: error.message
        });
    }
}

// ✅ Update country
export async function updateCountry(req, res) {
    try {
        const { id } = req.params;
        const { name, code, is_active } = req.body;
        
        console.log("📤 Updating country:", { id, name, code, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Country name is required"
            });
        }
        if (!code || !code.trim()) {
            return res.status(400).json({
                success: false,
                message: "Country code is required"
            });
        }
        
        const trimmedName = name.trim();
        const trimmedCode = code.trim().toUpperCase();
        
        // Check if country exists and not deleted
        const [existingRows] = await rawDb.query(
            'SELECT id FROM countries WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }
        
        // Check if another country has the same name or code
        const [duplicateRows] = await rawDb.query(
            'SELECT id FROM countries WHERE (name = ? OR code = ?) AND id != ? AND is_deleted = 0',
            [trimmedName, trimmedCode, id]
        );
        
        if (duplicateRows && duplicateRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Another country with this name or code already exists"
            });
        }
        
        await rawDb.query(
            'UPDATE countries SET name = ?, code = ?, is_active = ? WHERE id = ?',
            [trimmedName, trimmedCode, is_active, id]
        );
        
        const [updatedRows] = await rawDb.query(
            'SELECT id, name, code, is_active, is_deleted, user_id, created_at, updated_at FROM countries WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Country updated successfully",
            data: updatedRows[0]
        });
    } catch (error) {
        console.error("❌ Update country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update country",
            error: error.message
        });
    }
}

// ✅ Soft Delete country (sets is_deleted = 1)
export async function deleteCountry(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Soft deleting country:", id, "user:", req.user.id, "role:", req.user.role);
        
        // Check if country exists and not already deleted
        const [existingRows] = await rawDb.query(
            'SELECT id, is_deleted FROM countries WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Country not found or already deleted"
            });
        }
        
        // ✅ SOFT DELETE - Set is_deleted = 1 and is_active = 0
        await rawDb.query(
            'UPDATE countries SET is_deleted = 1, is_active = 0 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Country deleted successfully",
            data: { id, is_deleted: 1, is_active: 0 }
        });
    } catch (error) {
        console.error("❌ Delete country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete country",
            error: error.message
        });
    }
}

// ✅ Restore soft deleted country
export async function restoreCountry(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Restoring country:", id);
        
        const [existingRows] = await rawDb.query(
            'SELECT id FROM countries WHERE id = ? AND is_deleted = 1',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Deleted country not found"
            });
        }
        
        // ✅ RESTORE - Set is_deleted = 0 and is_active = 1
        await rawDb.query(
            'UPDATE countries SET is_deleted = 0, is_active = 1 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "Country restored successfully",
            data: { id, is_deleted: 0, is_active: 1 }
        });
    } catch (error) {
        console.error("❌ Restore country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to restore country",
            error: error.message
        });
    }
}

// ✅ Get cities by country ID
export async function getCitiesByCountry(req, res) {
    try {
        const { countryId } = req.params;
        const [cities] = await rawDb.query(
            'SELECT id, name FROM cities WHERE country_id = ? AND is_active = 1 AND is_deleted = 0 ORDER BY name',
            [countryId]
        );
        
        res.json({
            success: true,
            data: cities
        });
    } catch (error) {
        console.error("Get cities by country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch cities",
            error: error.message
        });
    }
}

// ✅ Get universities by country ID
export async function getUniversitiesByCountry(req, res) {
    try {
        const { countryId } = req.params;
        const [universities] = await rawDb.query(
            `SELECT u.id, u.name, u.website, u.ranking, ci.name as city_name
             FROM universities u
             LEFT JOIN cities ci ON u.city_id = ci.id
             WHERE u.country_id = ? AND u.is_active = 1 AND u.is_deleted = 0
             ORDER BY u.ranking ASC, u.name`,
            [countryId]
        );
        
        res.json({
            success: true,
            data: universities
        });
    } catch (error) {
        console.error("Get universities by country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch universities",
            error: error.message
        });
    }
}