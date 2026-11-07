import rawDb from "../../config/db.js";

// Canonical module list per role — the source of truth for what CAN be toggled.
// A role/module pair with no row in the DB defaults to enabled (fail-open for
// modules not yet explicitly configured).
const ROLE_MODULES = {
  counsellor: ["dashboard", "leads", "applications", "accounts", "chats"],
  processing_officer: ["dashboard", "applications"],
};

// ──────────────────────────────────────────────────────────────────────────────
// GET permissions for a role (admin-only management view)
// ──────────────────────────────────────────────────────────────────────────────
export async function getRolePermissions(req, res) {
  try {
    const { role } = req.params;
    const modules = ROLE_MODULES[role];
    if (!modules) {
      return res.status(400).json({ success: false, message: "Unknown role" });
    }

    const [rows] = await rawDb.query(
      "SELECT module_key, is_enabled FROM role_module_permissions WHERE role = ?",
      [role],
    );
    const stored = new Map(rows.map((r) => [r.module_key, !!r.is_enabled]));

    const permissions = modules.map((m) => ({
      module_key: m,
      is_enabled: stored.has(m) ? stored.get(m) : true,
    }));

    res.json({ success: true, data: { role, permissions } });
  } catch (error) {
    console.error("Get role permissions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// UPDATE permissions for a role (admin-only)
// ──────────────────────────────────────────────────────────────────────────────
export async function updateRolePermissions(req, res) {
  try {
    const { role } = req.params;
    const modules = ROLE_MODULES[role];
    if (!modules) {
      return res.status(400).json({ success: false, message: "Unknown role" });
    }

    const { permissions } = req.body; // { module_key: boolean, ... }
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ success: false, message: "permissions object is required" });
    }

    for (const moduleKey of Object.keys(permissions)) {
      if (!modules.includes(moduleKey)) continue;
      const isEnabled = !!permissions[moduleKey];
      await rawDb.query(
        `INSERT INTO role_module_permissions (role, module_key, is_enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
        [role, moduleKey, isEnabled],
      );
    }

    res.json({ success: true, message: "Permissions updated." });
  } catch (error) {
    console.error("Update role permissions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SELF-CHECK — the logged-in user's own module access (any authenticated role)
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyModuleAccess(req, res) {
  try {
    const role = req.user.role;
    const modules = ROLE_MODULES[role];
    if (!modules) {
      // admin/student aren't gated by this module list — treat as full access
      return res.json({ success: true, data: { role, permissions: {} } });
    }

    const [rows] = await rawDb.query(
      "SELECT module_key, is_enabled FROM role_module_permissions WHERE role = ?",
      [role],
    );
    const stored = new Map(rows.map((r) => [r.module_key, !!r.is_enabled]));

    const permissions = {};
    modules.forEach((m) => {
      permissions[m] = stored.has(m) ? stored.get(m) : true;
    });

    res.json({ success: true, data: { role, permissions } });
  } catch (error) {
    console.error("Get my module access error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE — block API access to a module if the caller's role has it disabled
// ──────────────────────────────────────────────────────────────────────────────
export function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role;
      if (role === "admin") return next(); // admin always has full access
      if (!ROLE_MODULES[role]) return next(); // role not gated by this system

      const [rows] = await rawDb.query(
        "SELECT is_enabled FROM role_module_permissions WHERE role = ? AND module_key = ?",
        [role, moduleKey],
      );
      const isEnabled = rows.length > 0 ? !!rows[0].is_enabled : true;

      if (!isEnabled) {
        return res.status(403).json({
          success: false,
          message: `Access to "${moduleKey}" has been disabled for your role by an administrator.`,
        });
      }
      next();
    } catch (error) {
      console.error("requireModule error:", error);
      res.status(500).json({ success: false, message: "Access check failed" });
    }
  };
}
