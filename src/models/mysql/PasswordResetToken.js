import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id:    { type: DataTypes.INTEGER, allowNull: false },
  token:      { type: DataTypes.STRING,  allowNull: false, unique: true },
  expires_at: { type: DataTypes.DATE,    allowNull: false },
}, { 
  tableName:  'password_reset_tokens', 
  timestamps: true,
  createdAt:  'created_at',
  updatedAt:  false,          // ✅ no updated_at column in this table
  underscored: true,
});

export default PasswordResetToken;