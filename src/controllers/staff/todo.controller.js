// src/controllers/staff/todo.controller.js
import db from "../../models/mysql/index.js";
import rawDb from "../../config/db.js";
import staffSocketManager from "../../services/socket.service.js";
import { storeNotification } from "../../utils/notificationHelper.js";
import sseManager from "../../utils/sseManager.js";

const { StaffTodo } = db;

export async function getStaffUsers(req, res) {
  try {
    const [rows] = await rawDb.query(
      "SELECT id, name, email, role FROM users WHERE role IN ('admin','counsellor','processing_officer') AND is_deleted = 0 ORDER BY name ASC",
    );
    res.json({ success: true, users: rows });
  } catch (error) {
    console.error("getStaffUsers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function getTodos(req, res) {
  try {
    const { assigned_to, status } = req.query;
    let sql = `
      SELECT t.*, cu.name AS created_by_name, au.name AS assigned_to_name
      FROM staff_todos t
      LEFT JOIN users cu ON cu.id = t.created_by
      LEFT JOIN users au ON au.id = t.assigned_to
      WHERE t.is_deleted = 0
    `;
    const params = [];
    if (assigned_to) {
      sql += " AND t.assigned_to = ?";
      params.push(assigned_to);
    }
    if (status) {
      sql += " AND t.status = ?";
      params.push(status);
    }
    sql += " ORDER BY t.due_date IS NULL, t.due_date ASC, t.created_at DESC";

    const [rows] = await rawDb.query(sql, params);
    res.json({ success: true, todos: rows });
  } catch (error) {
    console.error("getTodos error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function createTodo(req, res) {
  try {
    const { title, description, assigned_to, due_date } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const todo = await StaffTodo.create({
      title,
      description: description || null,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      created_by: req.user.id,
      status: "open",
    });

    if (assigned_to && Number(assigned_to) !== req.user.id) {
      const message = `${req.user.name} assigned you a task: "${title}"`;
      await storeNotification(assigned_to, "todo_assigned", message, { todoId: todo.id });
      sseManager.sendToUser(assigned_to.toString(), { type: "todo_assigned", message, todoId: todo.id });
    }

    staffSocketManager.broadcastTodoEvent("created", todo);
    res.status(201).json({ success: true, todo });
  } catch (error) {
    console.error("createTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function updateTodo(req, res) {
  try {
    const { id } = req.params;
    const { title, description, assigned_to, due_date, status } = req.body;

    const existing = await StaffTodo.findByPk(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Todo not found" });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (assigned_to !== undefined) updateData.assigned_to = assigned_to || null;
    if (due_date !== undefined) updateData.due_date = due_date || null;
    if (status !== undefined) {
      if (!["open", "in_progress", "done"].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }
      updateData.status = status;
    }

    await StaffTodo.update(updateData, { where: { id } });
    const updated = await StaffTodo.findByPk(id);

    staffSocketManager.broadcastTodoEvent("updated", updated);
    res.json({ success: true, todo: updated });
  } catch (error) {
    console.error("updateTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

export async function deleteTodo(req, res) {
  try {
    const { id } = req.params;
    const existing = await StaffTodo.findByPk(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Todo not found" });
    }
    // Only the person who created the todo (or an admin) may delete it — an
    // assignee who didn't create it shouldn't be able to remove a task
    // someone else handed them.
    if (req.user.role !== "admin" && existing.created_by !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Only the creator or an admin can delete this todo.",
      });
    }
    await StaffTodo.update({ is_deleted: 1 }, { where: { id } });
    staffSocketManager.broadcastTodoEvent("deleted", { id: Number(id) });
    res.json({ success: true, message: "Todo deleted" });
  } catch (error) {
    console.error("deleteTodo error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
