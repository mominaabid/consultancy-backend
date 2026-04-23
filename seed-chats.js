import { connectMongo } from './src/config/mongo.js';
import Conversation      from './src/models/mongo/Conversation.js';
import db                from './src/models/mysql/index.js';
import sequelize         from './src/config/db.js';

const { Lead, User } = db;

await sequelize.authenticate();
await connectMongo();

const leads = await Lead.findAll({
  where: { status: ['counseling', 'applied', 'visa', 'success'] },
  include: [{ model: User, as: 'counsellor', attributes: ['id', 'name'] }],
});

for (const lead of leads) {
  if (!lead.counsellor_id || !lead.email) continue;

  const student = await User.findOne({ where: { email: lead.email, role: 'student' } });
  if (!student) { console.log(`⚠️ No student user for: ${lead.email}`); continue; }

  const exists = await Conversation.findOne({
    student_id: student.id, counsellor_id: lead.counsellor_id,
  });

  if (!exists) {
    await Conversation.create({
      student_id:      student.id,
      counsellor_id:   lead.counsellor_id,
      student_name:    lead.name,
      counsellor_name: lead.counsellor?.name || 'Counsellor',
      last_message:    '',
    });
    console.log(`✅ Created: ${lead.name} ↔ ${lead.counsellor?.name}`);
  } else {
    console.log(`⏭️ Exists: ${lead.name}`);
  }
}

console.log('Done.');
process.exit(0);