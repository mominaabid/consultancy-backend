// src/routes/config.routes.js
import { Router } from "express";
import {
    getAllConfigs,
    getConfigByType,
    createConfig,
    updateConfig,
    deleteConfig,
    restoreConfig  // ✅ Add this import
} from "../controllers/config.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

// ✅ All routes with auth (both admin AND counsellor can access)
router.get("/", auth, getAllConfigs);
router.get("/:type", auth, getConfigByType);
router.post("/", auth, createConfig);
router.put("/:id", auth, updateConfig);
router.delete("/:id", auth, deleteConfig);
router.put("/:id/restore", auth, restoreConfig);  // ✅ Restore route

export default router;