import { Router } from "express";
import auth from "../../middleware/auth.middleware.js";
import {
  getStaffUsers,
  getTodos,
  createTodo,
  updateTodo,
  deleteTodo,
} from "../../controllers/staff/todo.controller.js";
import { getMessages, sendMessage, getUnreadCounts } from "../../controllers/staff/chat.controller.js";

const router = Router();

router.use(auth, (req, res, next) => {
  if (!["admin", "counsellor", "processing_officer"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Staff only." });
  }
  next();
});

router.get("/users", getStaffUsers);

router.get("/todos", getTodos);
router.post("/todos", createTodo);
router.put("/todos/:id", updateTodo);
router.delete("/todos/:id", deleteTodo);

router.get("/messages", getMessages);
router.post("/messages", sendMessage);
router.get("/messages/unread-counts", getUnreadCounts);

export default router;
