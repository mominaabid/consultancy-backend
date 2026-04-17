import { Router } from "express";
import db from "../../models/mysql/index.js";

const router = Router();
const { User } = db;

// GET COUNSELLORS
router.get("/", async (req, res) => {
  try {
    const where = {};

    if (req.query.role) {
      where.role = req.query.role;
    }

    const users = await User.findAll({ where });

    res.json({ data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;