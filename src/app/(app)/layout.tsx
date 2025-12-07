import { ReactNode } from "react";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ClientLayout } from "@/components/layout/ClientLayout";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userProfile = session.user.profile ?? session.user.role;

  return (
    <ClientLayout
      user={{
        name: session.user.name,
        email: session.user.email,
        role: userProfile
      }}
    >
      {children}
    </ClientLayout>
  );
}
