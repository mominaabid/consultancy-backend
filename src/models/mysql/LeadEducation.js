import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

const LeadEducation = sequelize.define(
  "LeadEducation",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "leads",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    degree: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    year_awarded: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1950,
        max: new Date().getFullYear(),
      },
    },
    grades_cgpa: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    board_university: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "lead_educations",
    timestamps: true,
    underscored: true,
  }
);

export default LeadEducation;