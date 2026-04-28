// src/models/mysql/Payment.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  student_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  application_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  total_fees: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  remaining_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  payment_type: {
    type: DataTypes.ENUM('application_fee', 'tuition_deposit', 'visa_fee', 'consultancy_fee', 'other'),
    defaultValue: 'consultancy_fee',
  },
  mode: {
    type: DataTypes.ENUM('cash', 'bank', 'online'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'awaiting_verification', 'rejected'),
    defaultValue: 'pending',
  },
  reference_no: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  transaction_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  receipt_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  payment_proof: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  paid_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  recorded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  verified_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  verified_at: {
    type: DataTypes.DATE,
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
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'payments',
  timestamps: true,
  createdAt: 'paid_at',
  updatedAt: 'updated_at',
  underscored: true,
});

export default Payment;