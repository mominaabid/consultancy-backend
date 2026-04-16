import sequelize from '../../config/db.js';
import Lead from './Lead.js';
import User from './User.js';

// Define associations
Lead.belongsTo(User, {
  foreignKey: 'counsellor_id',
  as: 'counsellor'
});

const db = {
  sequelize,
  Lead,
  User
};

export default db;