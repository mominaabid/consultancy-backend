// src/models/mysql/ActivityLog.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const ActivityLog = sequelize.define('ActivityLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  lead_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  action_type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  from_value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  to_value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  performed_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  performed_by_role: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  performed_by_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'activity_logs',
  timestamps: true,
  underscored: true,
});

export default ActivityLog;