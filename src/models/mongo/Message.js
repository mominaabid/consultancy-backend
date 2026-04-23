import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender_id:       { type: Number, required: true },   // MySQL users.id
  sender_role:     { type: String, enum: ['student', 'counsellor'], required: true },
  sender_name:     { type: String },
  content:         { type: String, required: true },
  type:            { type: String, enum: ['text', 'file'], default: 'text' },
  file_url:        { type: String },                   // for future file sharing
  is_read:         { type: Boolean, default: false },
}, {
  timestamps: true,
});

// Index for fast retrieval by conversation
messageSchema.index({ conversation_id: 1, createdAt: -1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;