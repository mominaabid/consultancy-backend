// src/routes/public/onlineQuery.routes.js
// Public (no-auth) route used by the Educatia website "Apply Now" form.
import { Router } from "express";
import { createOnlineQuery } from "../../controllers/onlineQuery.controller.js";

const router = Router();

// POST /api/v1/public/queries  → naya online query record (status "new").
// Lead yahan NAHI banti — admin portal par review karke convert karta hai.
router.post("/", createOnlineQuery);

export default router;
