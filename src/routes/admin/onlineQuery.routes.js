// src/routes/admin/onlineQuery.routes.js
// Admin-only. Counsellor / processing officer ko yahan 403 milega.
import { Router } from "express";
import {
  getAllOnlineQueries,
  getOnlineQueryStats,
  getOnlineQueryById,
  updateOnlineQueryStatus,
  addOnlineQueryNote,
  convertQueryToLead,
  deleteOnlineQuery,
} from "../../controllers/onlineQuery.controller.js";
import auth from "../../middleware/auth.middleware.js";
import role from "../../middleware/role.middleware.js";

const router = Router();

// Online Queries sirf admin ke liye hai, is liye koi requireModule() guard
// nahi — admin role module-permission system se gate hota hi nahi.
router.use(auth, role("admin"));

// ⚠️ /stats ko /:id se PEHLE rakhna zaroori hai, warna "stats" ko id samjha jayega.
router.get("/stats", getOnlineQueryStats);

router.get("/", getAllOnlineQueries);
router.get("/:id", getOnlineQueryById);
router.put("/:id/status", updateOnlineQueryStatus);
router.put("/:id/note", addOnlineQueryNote);
router.post("/:id/convert", convertQueryToLead);
router.delete("/:id", deleteOnlineQuery);

export default router;
