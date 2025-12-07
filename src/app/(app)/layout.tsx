import Link from "next/link";
import { ReactNode } from "react";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

const masterLinks = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/import", label: "Importar Leads" },
  { href: "/admin/offices", label: "Escritórios" },
  { href: "/admin/users", label: "Usuários" },
  { href: "/board", label: "Board" },
];

const userLinks = [{ href: "/board", label: "Board" }];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userProfile = session.user.profile ?? session.user.role;
  const links = userProfile === "MASTER" ? masterLinks : userLinks;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r bg-white/90 backdrop-blur-sm">
          <div className="px-5 py-6 flex flex-col h-full gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">CRM</p>
              <p className="text-lg font-semibold">Leads Industriais</p>
              <p className="text-sm font-semibold text-slate-900">{session.user.name ?? "Consultor"}</p>
              <p className="text-sm text-slate-500">{session.user.email}</p>
              <p className="text-xs text-slate-400 mt-1">Perfil: {userProfile}</p>
            </div>

            <nav className="flex flex-col gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto">
              <LogoutButton />
            </div>
          </div>
        </aside>
        <main className="flex-1 min-h-screen p-6">{children}</main>
      </div>
    </div>
  );
}
