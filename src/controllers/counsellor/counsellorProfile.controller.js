import {Counsellor} from "../../models/mysql/counsellor.js";
import User  from "../../models/mysql/User.js";
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

const normalizeCNIC = (cnic) => cnic.replace(/-/g, '');


export const getCounsellorProfile = async (req, res) => {
  try {
    const counsellor = await Counsellor.findOne({
      where: {
        user_id: req.user.id,
        is_deleted: false,
      },
      attributes: { exclude: ['id', 'user_id', 'is_deleted'] },
    });

    if (!counsellor) {
      return res.status(404).json({ message: 'Counsellor profile not found' });
    }

    const response = counsellor.toJSON();
    response.createdAt = counsellor.createdAt;
    response.updatedAt = counsellor.updatedAt;

    res.json(response);
  } catch (error) {
    console.error('GET profile error:', error);
    res.status(500).json({ message: 'Server error, please try again later' });
  }
};


export const updateCounsellorProfile = async (req, res) => {
  const { name, father_name, email, phone, cnic, address } = req.body;
  const normalizedCNIC = normalizeCNIC(cnic);

  const transaction = await sequelize.transaction();

  try {
    const counsellor = await Counsellor.findOne({
      where: { user_id: req.user.id, is_deleted: false },
      transaction,
    });

    if (!counsellor) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Counsellor profile not found' });
    }

    // Email check
    const existingEmail = await Counsellor.findOne({
      where: {
        email,
        user_id: { [Op.ne]: req.user.id },
        is_deleted: false,
      },
      transaction,
    });

    if (existingEmail) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Email already used by another counsellor' });
    }

    // Phone check
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
      return res.status(409).json({ message: 'Phone number already registered' });
    }

    // CNIC check
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
      return res.status(409).json({ message: 'CNIC already registered' });
    }

    // Update counsellor
    await counsellor.update(
      { name, father_name, email, phone, cnic: normalizedCNIC, address },
      { transaction }
    );

    // Sync User table
    const user = await User.findByPk(req.user.id, { transaction });

    if (user) {
      await user.update(
        { name, email },
        { transaction }
      );
    }

    await transaction.commit();

    const updatedProfile = counsellor.toJSON();
    delete updatedProfile.id;
    delete updatedProfile.user_id;
    delete updatedProfile.is_deleted;

    res.json(updatedProfile);
  } catch (error) {
    await transaction.rollback();
    console.error('UPDATE profile error:', error);
    res.status(500).json({ message: 'Server error, update failed' });
  }
};