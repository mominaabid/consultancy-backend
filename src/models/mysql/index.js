// src/models/mysql/index.js
import sequelize from "../../config/db.js";
import Lead from "./Lead.js";
import User from "./User.js";
import { Counsellor } from "./counsellor.js";
import PasswordResetToken from "./PasswordResetToken.js";
import LeadActivityLog from "./LeadActivityLog.js";
import Document from "./Document.js";
import Application from "./Application.js";
import Payment from "./Payment.js";

// ============================================
// ASSOCIATIONS
// ============================================

// ──────────────────────────────────────────
// Lead - User associations
// ──────────────────────────────────────────
// Lead.belongsTo(User, {
//   foreignKey: "counsellor_id",
//   as: "counsellor",
// });

// User.hasMany(Lead, {
//   foreignKey: "counsellor_id",
//   as: "assignedLeads",
// });

// Lead - User associations
// ──────────────────────────────────────────
Lead.belongsTo(User, {
  foreignKey: "counsellor_id",
  as: "counsellor",
});



User.hasMany(Lead, {
  foreignKey: "counsellor_id",
  as: "assignedLeads",
});

// ──────────────────────────────────────────
// Counsellor - User associations (ADD THIS)
// ──────────────────────────────────────────
Counsellor.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});
User.hasOne(Counsellor, {
  foreignKey: "user_id",
  as: "counsellorProfile", // use a different alias to avoid conflict
});

// ──────────────────────────────────────────
// Document associations
// ──────────────────────────────────────────
Document.belongsTo(Lead, {
  as: "student",
  foreignKey: "student_id",
});

Document.belongsTo(User, {
  as: "reviewer",
  foreignKey: "reviewed_by",
});

Lead.hasMany(Document, {
  as: "documents",
  foreignKey: "student_id",
});

User.hasMany(Document, {
  as: "reviewedDocuments",
  foreignKey: "reviewed_by",
});
// After defining all models

Lead.hasMany(Application, {
  foreignKey: 'user_id',     // because we are storing lead.id in user_id
  as: 'applications'
});

Application.belongsTo(Lead, {
  foreignKey: 'user_id',
  as: 'lead'
});


// ──────────────────────────────────────────
// Payment associations
// ──────────────────────────────────────────
Payment.belongsTo(Application, {
  as: "application",
  foreignKey: "application_id",
});

Payment.belongsTo(User, {
  as: "recordedBy",
  foreignKey: "recorded_by",
});

Payment.belongsTo(User, {
  as: "student",
  foreignKey: "user_id",
});

Payment.belongsTo(Lead, {
  as: "studentLead",
  foreignKey: "student_id",
});

Application.hasMany(Payment, {
  as: "payments",
  foreignKey: "application_id",
});

User.hasMany(Payment, {
  as: "payments",
  foreignKey: "user_id",
});

Lead.hasMany(Payment, {
  as: "leadPayments",
  foreignKey: "student_id",
});
// src/models/mysql/index.js - Add these associations

// Add these lines to your existing associations
Document.belongsTo(Application, { 
  as: 'application', 
  foreignKey: 'application_id' 
});
Application.hasMany(Document, { 
  as: 'documents', 
  foreignKey: 'application_id' 
});

Document.belongsTo(User, {
  as: 'uploader',
  foreignKey: 'uploaded_by_id'
});

// ============================================
// EXPORTS
// ============================================
const db = {
  sequelize,
  Sequelize: sequelize.Sequelize,
  Lead,
  User,
  Counsellor,
  PasswordResetToken,
  LeadActivityLog,
  Document,
  Application,
  Payment,
};

export default db;
