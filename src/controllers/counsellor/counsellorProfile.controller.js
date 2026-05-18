import { Counsellor } from "../../models/mysql/counsellor.js";
import User from "../../models/mysql/User.js";
import sequelize from "../../config/db.js";
import { Op } from "sequelize";

const normalizeCNIC = (cnic) => cnic.replace(/-/g, "");

export const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const relativePath = `uploads/${req.file.filename}`;

    const counsellor = await Counsellor.findOne({
      where: { user_id: userId, is_deleted: false },
    });

    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor profile not found" });
    }

    await counsellor.update({ profile_image: relativePath });

    const fullUrl = `${req.protocol}://${req.get("host")}/${relativePath}`;
    return res.status(200).json({
      message: "Profile image uploaded successfully",
      profilePictureUrl: fullUrl,
      profilePicturePath: relativePath,
    });
  } catch (error) {
    console.error("Upload profile image error:", error);
    return res
      .status(500)
      .json({ message: "Failed to upload profile image" });
  }
};

export const getCounsellorProfile = async (req, res) => {
  try {
    const counsellor = await Counsellor.findOne({
      where: {
        user_id: req.user.id,
        is_deleted: false,
      },
      attributes: { exclude: ["id", "user_id", "is_deleted"] },
    });

    if (!counsellor) {
      return res.status(404).json({ message: "Counsellor profile not found" });
    }

    const response = counsellor.toJSON();
    response.createdAt = counsellor.createdAt;
    response.updatedAt = counsellor.updatedAt;

    if (response.profile_image) {
      response.profilePictureUrl = `${req.protocol}://${req.get("host")}/${response.profile_image}`;
    }

    res.json(response);
  } catch (error) {
    console.error("GET profile error:", error);
    res.status(500).json({ message: "Server error, please try again later" });
  }
};

export const updateCounsellorProfile = async (req, res) => {
  const { name, father_name, phone, cnic, address } = req.body;
  const normalizedCNIC = cnic ? normalizeCNIC(cnic) : undefined;

  const transaction = await sequelize.transaction();

  try {
    const counsellor = await Counsellor.findOne({
      where: { user_id: req.user.id, is_deleted: false },
      transaction,
    });

    if (!counsellor) {
      await transaction.rollback();
      return res.status(404).json({ message: "Counsellor profile not found" });
    }

    const counsellorUpdate = {};
    if (name !== undefined) counsellorUpdate.name = name;
    if (father_name !== undefined) counsellorUpdate.father_name = father_name;
    if (phone !== undefined) counsellorUpdate.phone = phone;
    if (cnic !== undefined) counsellorUpdate.cnic = normalizedCNIC;
    if (address !== undefined) counsellorUpdate.address = address;

    if (phone && phone !== counsellor.phone) {
      const existingPhone = await Counsellor.findOne({
        where: {
          phone,
          user_id: { [Op.ne]: req.user.id },
          is_deleted: false,
        },
        transaction,
      });
      if (existingPhone) {
        await transaction.rollback();
        return res
          .status(409)
          .json({ message: "Phone number already registered" });
      }
    }

    if (cnic && normalizedCNIC !== counsellor.cnic) {
      const existingCNIC = await Counsellor.findOne({
        where: {
          cnic: normalizedCNIC,
          user_id: { [Op.ne]: req.user.id },
          is_deleted: false,
        },
        transaction,
      });
      if (existingCNIC) {
        await transaction.rollback();
        return res.status(409).json({ message: "CNIC already registered" });
      }
    }

    await counsellor.update(counsellorUpdate, { transaction });

    const user = await User.findByPk(req.user.id, { transaction });
    if (user && name !== undefined) {
      await user.update({ name }, { transaction });
    }

    await transaction.commit();

    const updatedProfile = counsellor.toJSON();
    delete updatedProfile.id;
    delete updatedProfile.user_id;
    delete updatedProfile.is_deleted;

    res.json(updatedProfile);
  } catch (error) {
    await transaction.rollback();
    console.error("UPDATE profile error:", error);
    res.status(500).json({ message: "Server error, update failed" });
  }
};
