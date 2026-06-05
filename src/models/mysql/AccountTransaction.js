import { DataTypes } from "sequelize";
import sequelize from "../../config/db.js";

const AccountTransaction = sequelize.define(
  "AccountTransaction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    invoice_no: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "References users.id (student)",
    },
    application_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "References applications.id",
    },
    debit: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
      allowNull: false,
    },
    credit: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.0,
      allowNull: false,
    },
    balance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: "Remaining payable balance after this transaction",
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "account_transactions",
    timestamps: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["application_id"] },
      { fields: ["date"] },
    ],
  }
);

export default AccountTransaction;