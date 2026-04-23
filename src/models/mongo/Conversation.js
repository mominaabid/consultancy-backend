import mongoose from 'mongoose';

// One conversation per student-counsellor pair
const conversationSchema = new mongoose.Schema({
  student_id:     { type: Number, required: true },   // MySQL users.id
  counsellor_id:  { type: Number, required: true },   // MySQL users.id
  student_name:   { type: String },
  counsellor_name:{ type: String },
  last_message:   { type: String, default: '' },
  last_message_at:{ type: Date,   default: Date.now },
  student_unread: { type: Number, default: 0 },       // unread count for student
  counsellor_unread:{ type: Number, default: 0 },     // unread count for counsellor
}, {
  timestamps: true,
});

// Unique pair — one conversation per student+counsellor
conversationSchema.index({ student_id: 1, counsellor_id: 1 }, { unique: true });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;