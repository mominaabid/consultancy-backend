// src/controllers/city.controller.js
import rawDb from "../config/db.js";

// ✅ Get all cities (exclude soft deleted)
export async function getCities(req, res) {
    try {
        const isAdmin = req.user?.role === 'admin';
        let query = `
            SELECT c.id, c.name, c.country_id, c.is_active, c.is_deleted, co.name as country_name 
            FROM cities c
            LEFT JOIN countries co ON c.country_id = co.id
            WHERE c.is_deleted = 0
        `;
        if (!isAdmin) {
            query += ' AND c.is_active = 1';
        }
        query += ' ORDER BY c.name';
        
        const [cities] = await rawDb.query(query);
        
        console.log("📥 Cities fetched:", cities?.length || 0);
        
        res.json({
            success: true,
            data: cities
        });
    } catch (error) {
        console.error("❌ Get cities error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch cities",
            error: error.message
        });
    }
}

// ✅ Get city by ID
export async function getCityById(req, res) {
    try {
        const { id } = req.params;
        const [rows] = await rawDb.query(
            `SELECT c.id, c.name, c.country_id, c.is_active, c.is_deleted, co.name as country_name 
             FROM cities c
             LEFT JOIN countries co ON c.country_id = co.id
             WHERE c.id = ? AND c.is_deleted = 0`,
            [id]
        );
        const city = rows[0];
        
        if (!city) {
            return res.status(404).json({
                success: false,
                message: "City not found"
            });
        }
        
        res.json({
            success: true,
            data: city
        });
    } catch (error) {
        console.error("❌ Get city error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch city",
            error: error.message
        });
    }
}

// ✅ Create city
export async function createCity(req, res) {
    try {
        const { name, country_id, is_active = 1 } = req.body;
        
        console.log("📤 Creating city:", { name, country_id, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "City name is required"
            });
        }
        if (!country_id) {
            return res.status(400).json({
                success: false,
                message: "Country ID is required"
            });
        }
        
        const trimmedName = name.trim();
        
        // Check if city already exists in this country (excluding soft deleted)
        const [existingRows] = await rawDb.query(
            'SELECT id FROM cities WHERE name = ? AND country_id = ? AND is_deleted = 0',
            [trimmedName, country_id]
        );
        
        if (existingRows && existingRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "City already exists in this country"
            });
        }
        
        // Check if country exists
        const [countryRows] = await rawDb.query(
            'SELECT id FROM countries WHERE id = ? AND is_deleted = 0',
            [country_id]
        );
        
        if (!countryRows || countryRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Country not found"
            });
        }
        
        const result = await rawDb.query(
            'INSERT INTO cities (name, country_id, is_active, is_deleted, user_id) VALUES (?, ?, ?, 0, ?)',
            [trimmedName, country_id, is_active, req.user.id]
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
        
        console.log("📥 Inserted city ID:", insertId);
        
        if (!insertId) {
            throw new Error("Failed to get inserted city ID");
        }
        
        const [newCityRows] = await rawDb.query(
            `SELECT c.id, c.name, c.country_id, c.is_active, c.is_deleted, co.name as country_name 
             FROM cities c
             LEFT JOIN countries co ON c.country_id = co.id
             WHERE c.id = ?`,
            [insertId]
        );
        
        const newCity = newCityRows[0];
        
        if (!newCity) {
            throw new Error("Failed to retrieve newly created city");
        }
        
        console.log("✅ City created successfully:", newCity);
        
        res.status(201).json({
            success: true,
            message: "City created successfully",
            data: newCity
        });
    } catch (error) {
        console.error("❌ Create city error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create city",
            error: error.message
        });
    }
}

// ✅ Update city
export async function updateCity(req, res) {
    try {
        const { id } = req.params;
        const { name, country_id, is_active } = req.body;
        
        console.log("📤 Updating city:", { id, name, country_id, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "City name is required"
            });
        }
        if (!country_id) {
            return res.status(400).json({
                success: false,
                message: "Country ID is required"
            });
        }
        
        const trimmedName = name.trim();
        
        // Check if city exists and not deleted
        const [existingRows] = await rawDb.query(
            'SELECT id FROM cities WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "City not found"
            });
        }
        
        // Check if another city has the same name in the same country
        const [duplicateRows] = await rawDb.query(
            'SELECT id FROM cities WHERE name = ? AND country_id = ? AND id != ? AND is_deleted = 0',
            [trimmedName, country_id, id]
        );
        
        if (duplicateRows && duplicateRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Another city with this name already exists in this country"
            });
        }
        
        await rawDb.query(
            'UPDATE cities SET name = ?, country_id = ?, is_active = ? WHERE id = ?',
            [trimmedName, country_id, is_active, id]
        );
        
        const [updatedRows] = await rawDb.query(
            `SELECT c.id, c.name, c.country_id, c.is_active, c.is_deleted, co.name as country_name 
             FROM cities c
             LEFT JOIN countries co ON c.country_id = co.id
             WHERE c.id = ?`,
            [id]
        );
        
        res.json({
            success: true,
            message: "City updated successfully",
            data: updatedRows[0]
        });
    } catch (error) {
        console.error("❌ Update city error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update city",
            error: error.message
        });
    }
}

// ✅ Soft Delete city (sets is_deleted = 1)
export async function deleteCity(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Soft deleting city:", id, "user:", req.user.id, "role:", req.user.role);
        
        // Check if city exists and not already deleted
        const [existingRows] = await rawDb.query(
            'SELECT id, is_deleted FROM cities WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "City not found or already deleted"
            });
        }
        
        // Check if city has universities (soft check - only active ones)
        const [univRows] = await rawDb.query(
            'SELECT COUNT(*) as count FROM universities WHERE city_id = ? AND is_deleted = 0',
            [id]
        );
        
        if (univRows[0]?.count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete city with ${univRows[0].count} existing university/ies. Please delete or reassign universities first.`
            });
        }
        
        // ✅ SOFT DELETE - Set is_deleted = 1 and is_active = 0
        await rawDb.query(
            'UPDATE cities SET is_deleted = 1, is_active = 0 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "City deleted successfully",
            data: { id, is_deleted: 1, is_active: 0 }
        });
    } catch (error) {
        console.error("❌ Delete city error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete city",
            error: error.message
        });
    }
}

// ✅ Restore soft deleted city
export async function restoreCity(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Restoring city:", id);
        
        const [existingRows] = await rawDb.query(
            'SELECT id FROM cities WHERE id = ? AND is_deleted = 1',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Deleted city not found"
            });
        }
        
        // ✅ RESTORE - Set is_deleted = 0 and is_active = 1
        await rawDb.query(
            'UPDATE cities SET is_deleted = 0, is_active = 1 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "City restored successfully",
            data: { id, is_deleted: 0, is_active: 1 }
        });
    } catch (error) {
        console.error("❌ Restore city error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to restore city",
            error: error.message
        });
    }
}

// ✅ Get cities by country ID (for dropdown)
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
        console.error("❌ Get cities by country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch cities",
            error: error.message
        });
    }
}