import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: 3306,
    dialect: 'mysql',
    logging: false,

    define: {
      timestamps: true,
      underscored: true,   // 🔥 THIS FIXES ALL YOUR ERRORS
      freezeTableName: true
    }
  }
);

export default sequelize;