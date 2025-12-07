import { User } from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";

type HeaderProps = {
    userName?: string | null;
    userRole?: string | null;
    onOpenProfile: () => void;
};

export function Header({ userName, userRole, onOpenProfile }: HeaderProps) {
    return (
        <header className="bg-pic-card border-b border-pic-zinc h-20 px-8 flex items-center justify-between sticky top-0 z-40 shadow-lg">
            <div className="flex items-center gap-6">
                {(userRole === "MASTER" || userRole === "GERENTE_SENIOR" || userRole === "PROPRIETARIO") && (
                    <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
                        <a href="/admin/dashboard" className="text-slate-400 hover:text-white transition-colors">Home</a>
                        <a href="/admin/distribuicao" className="text-slate-400 hover:text-neon-pink transition-colors">Gestão de Campanhas e Leads</a>
                        <a href="/admin/users" className="text-slate-400 hover:text-neon-blue transition-colors">Gestão de Usuários</a>
                        <a href="/admin/offices" className="text-slate-400 hover:text-neon-green transition-colors">Gestão de Escritórios</a>
                        <a href="/board" className="text-slate-400 hover:text-neon-yellow transition-colors">Area de Trabalho</a>
                    </nav>
                )}
            </div>

            <div className="flex items-center gap-6">
                {/* User Info & Actions */}
                <div className="hidden md:flex flex-col items-end">
                    <span className="text-sm font-bold text-white uppercase">{userName || "Consultor"}</span>
                    <span className="text-[10px] text-neon-green uppercase tracking-wider border border-neon-green/30 px-1 rounded-sm">
                        {userRole || "Perfil"}
                    </span>
                </div>

                <button
                    onClick={onOpenProfile}
                    className="w-10 h-10 rounded-full bg-pic-zinc border-2 border-slate-700 hover:border-neon-blue transition-colors flex items-center justify-center group relative overflow-hidden"
                    title="Meu Perfil"
                >
                    {/* Fallback Avatar Icon */}
                    <User className="text-slate-400 group-hover:text-neon-blue w-5 h-5" />
                </button>

                <div className="h-8 w-px bg-slate-800 mx-2"></div>

                <LogoutButton />
            </div>
        </header>
    );
}
