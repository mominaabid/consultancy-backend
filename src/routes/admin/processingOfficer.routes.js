import { Router } from "express";
import auth from "../../middleware/auth.middleware.js";
import {
  createProcessingOfficer,
  getAllProcessingOfficers,
  getProcessingOfficerById,
  updateProcessingOfficer,
  deleteProcessingOfficer,
} from "../../controllers/processingOfficer.controller.js";

const router = Router();
router.use(auth);
router.use((req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin only.",
    });
  }
  next();
});

router.post("/processing-officers", createProcessingOfficer);
router.get("/processing-officers", getAllProcessingOfficers);
router.get("/processing-officers/:id", getProcessingOfficerById);
router.put("/processing-officers/:id", updateProcessingOfficer);
router.delete("/processing-officers/:id", deleteProcessingOfficer);

export default router;
