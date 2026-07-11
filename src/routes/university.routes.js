// src/routes/university.routes.js
import { Router } from "express";
import {
    getUniversities,
    getUniversityById,
    createUniversity,
    updateUniversity,
    deleteUniversity,
    restoreUniversity  // ✅ Add this import
} from "../controllers/university.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

// ✅ All routes with auth (both admin and counsellor)
router.get("/", auth, getUniversities);
router.get("/:id", auth, getUniversityById);
router.post("/", auth, createUniversity);
router.put("/:id", auth, updateUniversity);
router.delete("/:id", auth, deleteUniversity);
router.put("/:id/restore", auth, restoreUniversity);  // ✅ Restore route

export default router;