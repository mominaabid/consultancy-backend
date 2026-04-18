// import db from "../models/mysql/index.js";
// const { CounsellorNote, Leads } = db;

// export async function addNote(req, res) {
//   try {
//     const { lead_id, counsellor_id, note } = req.body;

//     const newNote = await CounsellorNote.create({
//       lead_id,
//       counsellor_id,
//       note,
//     });

//     res.status(201).json(newNote);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }

// export async function getLeadNotes(req, res) {
//   try {
//     const notes = await CounsellorNote.findAll({
//       where: { lead_id: req.params.leadId },
//       include: [
//         {
//           model: UserActivation,
//           as: "consouller",
//           attributes: ["id", "name", "email"],
//         },
//       ],
//       order: [["created_at", "DESC"]],
//     });

//     res.json(notes);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: error.message });
//   }
// }
