import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

const MobileDoc = sequelize.define(
  "MobileDoc",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    doc_type: {
      type: DataTypes.ENUM(
        "passport",
        "transcript",
        "offer_letter",
        "visa",
        "sop",
        "ielts",
        "photo",
        "recommendation",
        "financial",
        "cv",
        "other"
      ),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "tbl_mobile_docs",
    timestamps: true,
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    underscored: false,
  }
);

export default MobileDoc;