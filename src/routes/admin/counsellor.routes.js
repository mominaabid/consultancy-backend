import { Router } from "express";
import {
  createCounsellor,
  getAllCounsellors,
  updateCounsellor,
  deleteCounsellor,
} from "../../controllers/counsellor.controller.js";

const router = Router();

// matches your frontend BASE_URL endpoints
router.get("/getCounsellors", getAllCounsellors);
router.post("/addCounsellor", createCounsellor);
router.put("/updateCounsellor/:id", updateCounsellor);
router.delete("/deleteCounsellor/:id", deleteCounsellor);

export default router;
