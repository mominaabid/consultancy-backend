import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

const Application = sequelize.define(
  "Application",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    full_name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    dob: DataTypes.DATEONLY,
    age: DataTypes.INTEGER,
    gender: DataTypes.STRING,
    cnic: DataTypes.STRING,
    passport_number: DataTypes.STRING,
    nationality: DataTypes.STRING,
    profile_picture: DataTypes.TEXT,

    study_level: DataTypes.STRING,
    board_university: DataTypes.STRING,
    grades_cgpa: DataTypes.STRING,
    year_awarded: DataTypes.INTEGER,
    english_proficiency_test: DataTypes.STRING,
    english_test_overall_score: DataTypes.STRING,

    target_country: DataTypes.STRING,
    target_university: DataTypes.STRING,
    course: DataTypes.STRING,
    counselor_notes: DataTypes.TEXT,

    status: {
      type: DataTypes.ENUM(
        "inquiry",
        "evaluation",
        "application submitted",
        "offer letter received",
        "offer letter not received",
        "visa filed",
        "approved",
        "reject",
      ),
      defaultValue: "inquiry",
    },

    inquiry_date: DataTypes.DATE,
    evaluation_date: DataTypes.DATE,
    application_submitted_date: DataTypes.DATE,
    offer_received_date: DataTypes.DATE,
    offer_not_received_date: DataTypes.DATE,
    visa_filed_date: DataTypes.DATE,
    approved_date: DataTypes.DATE,
    reject_date: DataTypes.DATE,

    deadline: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: "applications",
    timestamps: true,
  },
);

export default Application;
