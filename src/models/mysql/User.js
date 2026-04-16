import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const User = sequelize.define('User', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  name: DataTypes.STRING,
  email: DataTypes.STRING,
  password_hash: DataTypes.TEXT,
  role: DataTypes.ENUM('admin', 'counsellor', 'student'),
  is_active: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  }
}, {
  tableName: 'users',
  timestamps: true
});

export default User;