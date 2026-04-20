import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

export const Counsellor = sequelize.define(
  "Counsellor",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    father_name: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'father_name'
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    cnic: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    role: {
      type: DataTypes.STRING,
      defaultValue: "counsellor",
    },

    status: {
      type: DataTypes.ENUM("active", "inactive"),
      defaultValue: "active",
    },

    assigned_leads: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    conversion_rate: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
  },
  {
    tableName: "counsellors",
    timestamps: true,
    underscored: true, // Ye automatically camelCase ko snake_case mein convert karta hai DB ke liye
  }
);