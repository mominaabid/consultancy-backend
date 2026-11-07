// src/routes/city.routes.js
import { Router } from "express";
import {
    getCities,
    getCityById,
    createCity,
    updateCity,
    deleteCity,
    restoreCity  // ✅ Add this import
} from "../controllers/city.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

// ✅ All routes with auth (both admin and counsellor)
router.get("/", auth, getCities);
router.get("/:id", auth, getCityById);
router.post("/", auth, createCity);
router.put("/:id", auth, updateCity);
router.delete("/:id", auth, deleteCity);
router.put("/:id/restore", auth, restoreCity);  // ✅ Restore route

export default router;