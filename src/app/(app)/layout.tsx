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
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-pic-zinc bg-pic-card">
          <div className="px-5 py-6 flex flex-col h-full gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neon-pink font-bold">PIC</p>
              <p className="text-lg font-bold text-white uppercase leading-tight">
                Plataforma de<br />Inteligência<br />Comercial
              </p>
              <div className="mt-4 border-t border-dashed border-pic-zinc pt-4">
                <p className="text-sm font-semibold text-neon-green">{session.user.name ?? "Consultor"}</p>
                <p className="text-sm text-slate-400">{session.user.email}</p>
                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Perfil: {userProfile}</p>
              </div>
            </div>

            <nav className="flex flex-col gap-2 mt-4">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-none border border-transparent px-3 py-2 text-sm font-bold uppercase transition-colors hover:border-neon-green hover:text-neon-green hover:bg-pic-zinc/50 text-slate-300"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto pt-4 border-t border-pic-zinc">
              <LogoutButton />
            </div>
          </div>
        </aside>
        <main className="flex-1 min-h-screen p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
