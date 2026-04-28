import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";
import Application from "./Application.js";

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    password_hash: DataTypes.TEXT,
    role: DataTypes.ENUM("admin", "counsellor", "student"),
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "users",
    timestamps: true,
  },
);

User.hasMany(Application, { foreignKey: "user_id", as: "applications" });
Application.belongsTo(User, { foreignKey: "user_id", as: "user" });

export default User;
