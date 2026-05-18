import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

const Lead = sequelize.define(
  "Lead",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    source: DataTypes.ENUM("website", "walkin", "whatsapp", "email"),
    preferred_country: DataTypes.STRING,
    study_level: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM(
        "new",
        "contacted",
        "counseling",
        "applied",
        "visa",
        "success",
        "rejected",
      ),
      defaultValue: "new",
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    marital_status: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    father_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    father_contact: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    home_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // New educational fields
    year_awarded: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    grades_cgpa: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    board_university: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    english_proficiency_test: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    english_test_overall_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    english_test_scores: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    counsellor_id: DataTypes.INTEGER,
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    profile_picture: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "leads",
    timestamps: true,
    underscored: true,
  },
);

export default Lead;
