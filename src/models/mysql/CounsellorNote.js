// import { DataTypes } from "sequelize";
// import sequelize from "../../config/db.js";

// const CounsellorNote = sequalize.define(
//   "CounsellorNote",
//   {
//     id: {
//       type: DataTypes.INTEGER,
//       primaryKey: true,
//       autoIncrement: true,
//     },

//     lead_id: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: "leads", key: "id" },
//     },

//     counsellor_id: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//       references: { model: "users", key: "id" },
//     },

//     note: {
//       type: DataTypes.TEXT,
//       allowNull: false,
//     },
//   },
//   {
//     tableName: "counsellor_notes",
//     timestamps: true,
//     underscored: true,
//   },
// );

// export default CounsellorNote;
