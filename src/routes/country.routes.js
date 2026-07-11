// src/routes/country.routes.js
import { Router } from "express";
import {
    getCountries,
    getCountryById,
    createCountry,
    updateCountry,
    deleteCountry,
    restoreCountry,  // ✅ Add this import
    getCitiesByCountry,
    getUniversitiesByCountry
} from "../controllers/country.controller.js";
import auth from "../middleware/auth.middleware.js";

const router = Router();

// ✅ All routes with auth
router.get("/", auth, getCountries);
router.get("/:id", auth, getCountryById);
router.post("/", auth, createCountry);
router.put("/:id", auth, updateCountry);
router.delete("/:id", auth, deleteCountry);
router.put("/:id/restore", auth, restoreCountry);  // ✅ Restore route

// ✅ Nested routes - MUST come before /:id
router.get("/:countryId/cities", auth, getCitiesByCountry);
router.get("/:countryId/universities", auth, getUniversitiesByCountry);

export default router;