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
 
    last_degree: DataTypes.STRING,
    institute: DataTypes.STRING,
    cgpa: DataTypes.STRING,
    passing_year: DataTypes.INTEGER,
    english_test: DataTypes.STRING,
    test_score: DataTypes.STRING,
 
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
        "reject"
      ),
      defaultValue: "inquiry",
    },
 
    // Stage date fields
    inquiry_date: DataTypes.DATE,
    evaluation_date: DataTypes.DATE,
    application_submitted_date: DataTypes.DATE,
    offer_received_date: DataTypes.DATE,
    offer_not_received_date: DataTypes.DATE,
    visa_filed_date: DataTypes.DATE,
    approved_date: DataTypes.DATE,
    reject_date: DataTypes.DATE,
 
    // deadline: DataTypes.STRING,
    // round: DataTypes.STRING,
  },
  {
    tableName: "applications",
    timestamps: true,
  },
);
 
export default Application;