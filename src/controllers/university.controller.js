// src/controllers/university.controller.js
import rawDb from "../config/db.js";

// ✅ Get all universities (exclude soft deleted)
export async function getUniversities(req, res) {
    try {
        const { country_id, city_id, search } = req.query;
        const isAdmin = req.user?.role === 'admin';
        
        let sql = `
            SELECT u.*, co.name as country_name, ci.name as city_name 
            FROM universities u
            LEFT JOIN countries co ON u.country_id = co.id
            LEFT JOIN cities ci ON u.city_id = ci.id
            WHERE u.is_deleted = 0
        `;
        const params = [];
        
        if (!isAdmin) {
            sql += ' AND u.is_active = 1';
        }
        
        if (country_id) {
            sql += ' AND u.country_id = ?';
            params.push(country_id);
        }
        if (city_id) {
            sql += ' AND u.city_id = ?';
            params.push(city_id);
        }
        if (search) {
            sql += ' AND u.name LIKE ?';
            params.push(`%${search}%`);
        }
        
        sql += ' ORDER BY u.ranking ASC, u.name';
        
        const [universities] = await rawDb.query(sql, params);
        
        console.log("📥 Universities fetched:", universities?.length || 0);
        
        res.json({
            success: true,
            data: universities
        });
    } catch (error) {
        console.error("❌ Get universities error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch universities",
            error: error.message
        });
    }
}

// ✅ Get university by ID
export async function getUniversityById(req, res) {
    try {
        const { id } = req.params;
        const [rows] = await rawDb.query(
            `SELECT u.*, co.name as country_name, ci.name as city_name 
             FROM universities u
             LEFT JOIN countries co ON u.country_id = co.id
             LEFT JOIN cities ci ON u.city_id = ci.id
             WHERE u.id = ? AND u.is_deleted = 0`,
            [id]
        );
        const university = rows[0];
        
        if (!university) {
            return res.status(404).json({
                success: false,
                message: "University not found"
            });
        }
        
        res.json({
            success: true,
            data: university
        });
    } catch (error) {
        console.error("❌ Get university error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch university",
            error: error.message
        });
    }
}

// ✅ Create university
export async function createUniversity(req, res) {
    try {
        const { name, country_id, city_id, website, ranking, is_active = 1 } = req.body;
        
        console.log("📤 Creating university:", { name, country_id, city_id, website, ranking, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "University name is required"
            });
        }
        if (!country_id) {
            return res.status(400).json({
                success: false,
                message: "Country ID is required"
            });
        }
        
        const trimmedName = name.trim();
        
        // Check if university already exists (excluding soft deleted)
        const [existingRows] = await rawDb.query(
            'SELECT id FROM universities WHERE name = ? AND is_deleted = 0',
            [trimmedName]
        );
        
        if (existingRows && existingRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "University already exists"
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
        
        // Check if city exists (if provided)
        if (city_id) {
            const [cityRows] = await rawDb.query(
                'SELECT id FROM cities WHERE id = ? AND is_deleted = 0',
                [city_id]
            );
            if (!cityRows || cityRows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "City not found"
                });
            }
        }
        
        const result = await rawDb.query(
            'INSERT INTO universities (name, country_id, city_id, website, ranking, is_active, is_deleted, user_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
            [trimmedName, country_id, city_id || null, website || null, ranking || null, is_active, req.user.id]
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
        
        console.log("📥 Inserted university ID:", insertId);
        
        if (!insertId) {
            throw new Error("Failed to get inserted university ID");
        }
        
        const [newRows] = await rawDb.query(
            `SELECT u.*, co.name as country_name, ci.name as city_name 
             FROM universities u
             LEFT JOIN countries co ON u.country_id = co.id
             LEFT JOIN cities ci ON u.city_id = ci.id
             WHERE u.id = ?`,
            [insertId]
        );
        
        const newUniversity = newRows[0];
        
        if (!newUniversity) {
            throw new Error("Failed to retrieve newly created university");
        }
        
        console.log("✅ University created successfully:", newUniversity);
        
        res.status(201).json({
            success: true,
            message: "University created successfully",
            data: newUniversity
        });
    } catch (error) {
        console.error("❌ Create university error:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to create university",
            error: error.message
        });
    }
}

// ✅ Update university
export async function updateUniversity(req, res) {
    try {
        const { id } = req.params;
        const { name, country_id, city_id, website, ranking, is_active } = req.body;
        
        console.log("📤 Updating university:", { id, name, country_id, city_id, website, ranking, is_active, user: req.user.id, role: req.user.role });
        
        // Validate input
        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "University name is required"
            });
        }
        
        const trimmedName = name.trim();
        
        // Check if university exists and not deleted
        const [existingRows] = await rawDb.query(
            'SELECT id FROM universities WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "University not found"
            });
        }
        
        // Check if another university has the same name
        const [duplicateRows] = await rawDb.query(
            'SELECT id FROM universities WHERE name = ? AND id != ? AND is_deleted = 0',
            [trimmedName, id]
        );
        
        if (duplicateRows && duplicateRows.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Another university with this name already exists"
            });
        }
        
        await rawDb.query(
            'UPDATE universities SET name = ?, country_id = ?, city_id = ?, website = ?, ranking = ?, is_active = ? WHERE id = ?',
            [trimmedName, country_id, city_id || null, website || null, ranking || null, is_active, id]
        );
        
        const [updatedRows] = await rawDb.query(
            `SELECT u.*, co.name as country_name, ci.name as city_name 
             FROM universities u
             LEFT JOIN countries co ON u.country_id = co.id
             LEFT JOIN cities ci ON u.city_id = ci.id
             WHERE u.id = ?`,
            [id]
        );
        
        res.json({
            success: true,
            message: "University updated successfully",
            data: updatedRows[0]
        });
    } catch (error) {
        console.error("❌ Update university error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update university",
            error: error.message
        });
    }
}

// ✅ Soft Delete university (sets is_deleted = 1)
export async function deleteUniversity(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Soft deleting university:", id, "user:", req.user.id, "role:", req.user.role);
        
        // Check if university exists and not already deleted
        const [existingRows] = await rawDb.query(
            'SELECT id, is_deleted FROM universities WHERE id = ? AND is_deleted = 0',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "University not found or already deleted"
            });
        }
        
        // Check if university has applications
        const [appRows] = await rawDb.query(
            'SELECT COUNT(*) as count FROM applications WHERE university_id = ? AND is_deleted = 0',
            [id]
        );
        
        if (appRows[0]?.count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete university with ${appRows[0].count} existing application(s). Please deactivate instead.`
            });
        }
        
        // ✅ SOFT DELETE - Set is_deleted = 1 and is_active = 0
        await rawDb.query(
            'UPDATE universities SET is_deleted = 1, is_active = 0 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "University deleted successfully",
            data: { id, is_deleted: 1, is_active: 0 }
        });
    } catch (error) {
        console.error("❌ Delete university error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete university",
            error: error.message
        });
    }
}

// ✅ Restore soft deleted university
export async function restoreUniversity(req, res) {
    try {
        const { id } = req.params;
        
        console.log("📤 Restoring university:", id);
        
        const [existingRows] = await rawDb.query(
            'SELECT id FROM universities WHERE id = ? AND is_deleted = 1',
            [id]
        );
        
        if (!existingRows || existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Deleted university not found"
            });
        }
        
        // ✅ RESTORE - Set is_deleted = 0 and is_active = 1
        await rawDb.query(
            'UPDATE universities SET is_deleted = 0, is_active = 1 WHERE id = ?',
            [id]
        );
        
        res.json({
            success: true,
            message: "University restored successfully",
            data: { id, is_deleted: 0, is_active: 1 }
        });
    } catch (error) {
        console.error("❌ Restore university error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to restore university",
            error: error.message
        });
    }
}

// ✅ Get universities by country ID (for dropdown)
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
        console.error("❌ Get universities by country error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch universities",
            error: error.message
        });
    }
}