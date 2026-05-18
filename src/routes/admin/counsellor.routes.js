import { Router } from "express";
import {
  createCounsellor,
  getAllCounsellors,
  updateCounsellor,
  deleteCounsellor,
} from "../../controllers/counsellor.controller.js";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";

const router = Router();

router.use(auth);
router.use(role("admin"));

router.get("/getCounsellors", getAllCounsellors);
router.post("/addCounsellor", createCounsellor);
router.put("/updateCounsellor/:id", updateCounsellor);
router.delete("/deleteCounsellor/:id", deleteCounsellor);

export default router;
