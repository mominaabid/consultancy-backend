// src/models/mysql/Document.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  
  student_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  application_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
// src/models/mysql/Document.js - Make sure doc_type ENUM includes all types
doc_type: {
  type: DataTypes.ENUM(
    'passport', 'transcript', 'offer_letter', 'visa',
    'sop', 'ielts', 'photo', 'recommendation', 
    'financial', 'cv', 'other'
  ),
  allowNull: false,
},
  file_path: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'review', 'verified', 'rejected'),
    defaultValue: 'pending',
  },
  uploaded_by: {
    type: DataTypes.ENUM('student', 'counsellor', 'admin'),
    defaultValue: 'student',
  },
  uploaded_by_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status_history: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
  },
  review_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  reviewed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  uploaded_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'documents',
  timestamps: true,
  createdAt: 'uploaded_at',
  updatedAt: 'updated_at',
  underscored: true,
});

export default Document;