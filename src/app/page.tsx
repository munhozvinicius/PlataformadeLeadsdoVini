import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role === "MASTER" || session.user.role === "GERENTE_SENIOR" || session.user.role === "PROPRIETARIO") {
    redirect("/admin/dashboard");
  }

  redirect("/board");
}
