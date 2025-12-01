import { authOptions } from "@/lib/auth";
import User from "@/models/User";
import { getServerSession } from "next-auth";

export type SessionUser = {
  id: string;
  role: "MASTER" | "OWNER" | "CONSULTOR";
  email?: string | null;
  name?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: session.user.id,
    role: session.user.role as SessionUser["role"],
    email: session.user.email,
    name: session.user.name,
  };
}

export async function getOwnerTeamIds(ownerId: string) {
  const consultants = await User.find({ owner: ownerId, role: "CONSULTOR" }).select("_id");
  return [ownerId, ...consultants.map((c) => c._id.toString())];
}

export async function companyAccessFilter(user: SessionUser) {
  if (user.role === "MASTER") return {};
  if (user.role === "OWNER") {
    const teamIds = await getOwnerTeamIds(user.id);
    return { assignedTo: { $in: teamIds } };
  }
  return { assignedTo: user.id };
}
