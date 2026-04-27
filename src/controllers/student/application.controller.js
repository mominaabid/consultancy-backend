import Application from "../../models/mysql/Application.js";

export const getProfile = async (req, res) => {
  res.json({
    name: "James Wilson",
  });
};

export const addApplication = async (req, res) => {
  try {
    const data = req.body;

    if (req.file) {
      data.profile_picture = `/uploads/${req.file.filename}`;
    }

    const application = await Application.create({
      ...data,
    });

    res.status(201).json(application);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create application" });
  }
};

export const getApplications = async (req, res) => {
  try {
    const apps = await Application.findAll({
      order: [["created_at", "DESC"]],
    });

    res.json(apps);
  } catch (err) {
    res.status(500).json({ message: "Error fetching applications" });
  }
};

export const updateApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    if (req.file) {
      data.profile_picture = `/uploads/${req.file.filename}`;
    }

    await Application.update(data, { where: { id } });

    const updated = await Application.findByPk(id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Error updating application" });
  }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await Application.update({ status }, { where: { id } });

    const updated = await Application.findByPk(id);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Error updating status" });
  }
};

export const deleteApplication = async (req, res) => {
  try {
    const { id } = req.params;

    await Application.destroy({ where: { id } });

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting application" });
  }
};
