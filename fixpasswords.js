import bcrypt from "bcryptjs";
import db from "./src/models/mysql/index.js";

const { User } = db;

const users = [
  { email: "admin@educatia.pk", password: "admin123" },
  { email: "ali@educatia.pk", password: "hash123" },
  { email: "sara@educatia.pk", password: "hash123" },
  { email: "sara1@educatia.pk", password: "123" },
];

const run = async () => {
  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);

    await User.update(
      { password_hash: hashed },
      { where: { email: u.email } }
    );

    console.log(`✅ Updated: ${u.email}`);
  }

  console.log("All passwords hashed successfully.");
  process.exit();
};

run();