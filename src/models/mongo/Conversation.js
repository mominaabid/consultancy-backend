import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  student_id:     { type: Number, required: true },   
  counsellor_id:  { type: Number, required: true },   
  student_name:   { type: String },
  counsellor_name:{ type: String },
  last_message:   { type: String, default: '' },
  last_message_at:{ type: Date,   default: Date.now },
  student_unread: { type: Number, default: 0 },       
  counsellor_unread:{ type: Number, default: 0 },    
}, {
  timestamps: true,
});

conversationSchema.index({ student_id: 1, counsellor_id: 1 }, { unique: true });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;