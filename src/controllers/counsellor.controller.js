import db from "../models/mysql/index.js";
const { Counsellor } = db;

export async function createCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.create(req.body);

    return res.status(201).json({
      message: "Counsellor created successfully",
      data: counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAllCounsellors(req, res) {
  try {
    const counsellors = await Counsellor.findAll({
      order: [["id", "DESC"]],
    });

    res.json(counsellors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);

    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    await counsellor.update(req.body);

    res.json({
      message: "Counsellor updated successfully",
      data: counsellor,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteCounsellor(req, res) {
  try {
    const counsellor = await Counsellor.findByPk(req.params.id);

    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor not found" });
    }

    await counsellor.destroy();

    res.json({ message: "Counsellor deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}