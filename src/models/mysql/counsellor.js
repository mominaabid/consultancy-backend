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

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    role: {
      type: DataTypes.STRING,
      allowNull: false,
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
    underscored: true,
  }
);

