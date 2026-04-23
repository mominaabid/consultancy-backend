import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Lead = sequelize.define('Lead', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  name: DataTypes.STRING,
  email: DataTypes.STRING,
  phone: DataTypes.STRING,
  source: DataTypes.ENUM('website', 'walkin', 'whatsapp', 'email'),
  preferred_country: DataTypes.STRING,
  study_level: DataTypes.STRING,
  status: {
    type: DataTypes.ENUM(
      'new', 'contacted', 'counseling', 'applied', 'visa', 'success', 'rejected'
    ),
    defaultValue: 'new'
  },
  counsellor_id: DataTypes.INTEGER,
  is_deleted: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  }
}, {
  tableName: 'leads',
  timestamps: true,
   underscored: true
});

export default Lead;