import bcrypt from "bcryptjs";
import User from "@/models/User";
import { connectToDatabase } from "./mongodb";

let masterSeeded = false;

// Ensures there is at least one MASTER user in the database.
// Falls back to default credentials if envs are missing to avoid lockout.
export async function ensureMasterUser() {
  if (masterSeeded) return;

  const email = process.env.MASTER_EMAIL || "munhoz.vinicius@gmail.com";
  const password = process.env.MASTER_PASSWORD || "Theforce85!!";

  await connectToDatabase();
  const existing = await User.findOne({ role: "MASTER" });
  if (existing) {
    masterSeeded = true;
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await User.create({
    name: "Vinicius Munhoz",
    email,
    password: hashed,
    role: "MASTER",
  });
  masterSeeded = true;
}
