import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import User from "@/models/User";
import { connectToDatabase } from "@/lib/mongodb";
import { getSessionUser } from "@/lib/auth-helpers";

export async function GET() {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const users = await User.find()
    .populate("owner", "name email role")
    .select("name email role owner createdAt");

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  await connectToDatabase();
  const sessionUser = await getSessionUser();
  if (!sessionUser || sessionUser.role !== "MASTER") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, password, role, owner } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json({ message: "Missing fields" }, { status: 400 });
  }

  if (!["OWNER", "CONSULTOR"].includes(role)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  if (role === "CONSULTOR" && !owner) {
    return NextResponse.json({ message: "Consultor precisa de um OWNER" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);

  try {
    const user = await User.create({
      name,
      email,
      password: hashed,
      role,
      owner: role === "CONSULTOR" ? owner || null : null,
    });

    return NextResponse.json(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      { status: 201 }
    );
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 11000) {
      return NextResponse.json({ message: "Email já cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ message: "Erro ao criar usuário" }, { status: 500 });
  }
}
