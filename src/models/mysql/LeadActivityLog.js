import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LeadActivityLog = sequelize.define('LeadActivityLog', {
  id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lead_id:            { type: DataTypes.INTEGER, allowNull: true }, // null for non-lead actions
  action_type:        { type: DataTypes.STRING(50), allowNull: false },
  from_value:         { type: DataTypes.STRING(100) },
  to_value:           { type: DataTypes.STRING(100) },
  note:               { type: DataTypes.TEXT },
  performed_by:       { type: DataTypes.INTEGER },
  performed_by_role:  { type: DataTypes.STRING(50) },
  performed_by_name:  { type: DataTypes.STRING(255) },
}, {
  tableName:   'lead_activity_logs',
  timestamps:  true,
  createdAt:   'created_at',
  updatedAt:   false,
  underscored: true,
});

export default LeadActivityLog;