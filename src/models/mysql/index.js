import sequelize from "../../config/db.js";
import Lead from "./Lead.js";
import User from "./User.js";
import { Counsellor } from "./counsellor.js";
import PasswordResetToken from "./PasswordResetToken.js";
import LeadActivityLog from "./LeadActivityLog.js";
import Document from "./Document.js";
// Define associations
Lead.belongsTo(User, {
  foreignKey: "counsellor_id",
  as: "counsellor",
});

Document.belongsTo(Lead, { as: 'student', foreignKey: 'student_id' });
Document.belongsTo(User, { as: 'reviewer', foreignKey: 'reviewed_by' });
Lead.hasMany(Document, { as: 'documents', foreignKey: 'student_id' });

const db = {
  sequelize,
  Lead,
  User,
  Counsellor,
  PasswordResetToken,
  LeadActivityLog,
  Document,
};

export default db;
