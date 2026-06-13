import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";
import User from "./User.js";

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "notifications",
    timestamps: true, // automatically adds created_at & updated_at
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        name: "idx_user_read",
        fields: ["user_id", "is_read"],
      },
    ],
  },
);

// Association
Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });

export default Notification;
