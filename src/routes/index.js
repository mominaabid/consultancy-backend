import express from "express";
import leadRoutes from "./admin/lead.routes.js";
import userRoutes from "./admin/user.routes.js";

const router = express.Router();

router.use("/admin/leads", leadRoutes);
router.use("/admin/users", userRoutes);

export default router;