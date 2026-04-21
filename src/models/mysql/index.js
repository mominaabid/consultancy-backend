import sequelize from "../../config/db.js";
import Lead from "./Lead.js";
import User from "./User.js";
import { Counsellor } from "./counsellor.js";
import PasswordResetToken from "./PasswordResetToken.js";
// Define associations
Lead.belongsTo(User, {
  foreignKey: "counsellor_id",
  as: "counsellor",
});

const db = {
  sequelize,
  Lead,
  User,
  Counsellor,
  PasswordResetToken,
};

export default db;
