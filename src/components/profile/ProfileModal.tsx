import React, { useState } from "react";
import { X, User, Lock, Save } from "lucide-react";

type ProfileModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

const AVATARS = [
    "cyber-1", "cyber-2", "cyber-3", "cyber-4", "neon-1", "neon-2"
];

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const [tab, setTab] = useState<"avatar" | "security">("security");
    const [passwordForm, setPasswordForm] = useState({ current: "", new: "", confirm: "" });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error", text: string } | null>(null);

    if (!isOpen) return null;

    async function handlePasswordChange(e: React.FormEvent) {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            setMsg({ type: "error", text: "Senhas não conferem!" });
            return;
        }
        setLoading(true);
        setMsg(null);

        try {
            // Mock API call expectation
            const res = await fetch("/api/users/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldPassword: passwordForm.current, newPassword: passwordForm.new })
            });

            if (res.ok) {
                setMsg({ type: "success", text: "Senha alterada com sucesso!" });
                setPasswordForm({ current: "", new: "", confirm: "" });
            } else {
                setMsg({ type: "error", text: "Erro ao alterar senha. Verifique a senha atual." });
            }
        } catch {
            setMsg({ type: "error", text: "Erro interno." });
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-pic-dark border-2 border-neon-blue shadow-[0_0_50px_rgba(0,0,0,0.8)] relative flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-pic-zinc flex justify-between items-center bg-[url('/grid.svg')]">
                    <h2 className="text-xl font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <User className="text-neon-blue" />
                        Meu Perfil
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-pic-zinc">
                    <button
                        onClick={() => setTab("security")}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${tab === "security" ? "bg-neon-blue text-black" : "text-slate-500 hover:text-white"}`}
                    >
                        Segurança
                    </button>
                    <button
                        onClick={() => setTab("avatar")}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors ${tab === "avatar" ? "bg-neon-blue text-black" : "text-slate-500 hover:text-white"}`}
                    >
                        Avatar
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {tab === "security" && (
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Senha Atual</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="password"
                                        required
                                        value={passwordForm.current}
                                        onChange={e => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                        className="w-full bg-black border border-slate-700 pl-9 p-2 text-white text-sm focus:border-neon-blue outline-none transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Nova Senha</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={passwordForm.new}
                                        onChange={e => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                        className="w-full bg-black border border-slate-700 pl-9 p-2 text-white text-sm focus:border-neon-blue outline-none transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Confirmar Nova Senha</label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={passwordForm.confirm}
                                        onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                        className="w-full bg-black border border-slate-700 pl-9 p-2 text-white text-sm focus:border-neon-blue outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            {msg && (
                                <div className={`text-xs p-2 border ${msg.type === "success" ? "border-green-500 text-green-400 bg-green-900/20" : "border-red-500 text-red-400 bg-red-900/20"}`}>
                                    {msg.text}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-white text-black font-black uppercase py-3 hover:bg-neon-blue hover:text-black transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? "Salvando..." : <><Save size={16} /> Alterar Senha</>}
                            </button>
                        </form>
                    )}

                    {tab === "avatar" && (
                        <div className="text-center py-8">
                            <p className="text-slate-400 text-sm mb-4">Escolha um avatar para seu perfil:</p>
                            <div className="grid grid-cols-3 gap-4">
                                {AVATARS.map(av => (
                                    <button
                                        key={av}
                                        type="button"
                                        className="aspect-square bg-slate-800 border-2 border-transparent hover:border-neon-pink rounded-lg flex items-center justify-center group relative overflow-hidden"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-tr from-neon-blue/20 to-neon-pink/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <User className="text-slate-500 group-hover:text-white" />
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-4 uppercase tracking-widest">Em breve: Upload de imagem</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
