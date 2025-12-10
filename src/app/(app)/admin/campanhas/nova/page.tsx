"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

type Office = {
    id: string;
    name: string;
    code: string;
    office: string; // The enum value or unique ident
};

export default function NovaCampanhaPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [offices, setOffices] = useState<Office[]>([]);

    // Form State
    const [nome, setNome] = useState("");
    const [descricao, setDescricao] = useState("");
    const [type, setType] = useState("COCKPIT");
    const [office, setOffice] = useState("");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/login");
        } else if (status === "authenticated") {
            if (session.user.role === "CONSULTOR") {
                router.replace("/admin/campanhas"); // Or board
            }

            // Load Offices if MASTER/GS
            if (["MASTER", "GERENTE_SENIOR"].includes(session?.user?.role || "")) {
                fetch("/api/admin/offices")
                    .then(res => res.json())
                    .then(data => {
                        setOffices(Array.isArray(data) ? data : []);
                        if (Array.isArray(data) && data.length > 0) {
                            setOffice(data[0].office || data[0].code); // Default
                        }
                    })
                    .catch(err => console.error("Failed to load offices", err));
            } else {
                // GN/Proprietario: set their office
                setOffice(session?.user?.office || "");
            }
        }
    }, [status, session, router]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const res = await fetch("/api/campanhas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nome,
                    descricao,
                    type,
                    office
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Erro ao criar campanha");
            }

            const data = await res.json();
            router.push(`/admin/campanhas/${data.id}`);

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
            setMessage(errorMessage);
        } finally {
            setLoading(false);
        }
    }

    if (status === "loading") return <div>Carregando...</div>;

    const canSelectOffice = ["MASTER", "GERENTE_SENIOR"].includes(session?.user.role || "");

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-slate-900">Nova Campanha</h1>
                <Link
                    href="/admin/campanhas"
                    className="text-sm text-slate-500 hover:text-slate-900"
                >
                    Cancelar
                </Link>
            </div>

            <div className="bg-white rounded-xl border shadow-sm p-6">
                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* Nome */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Nome da Campanha</label>
                        <input
                            type="text"
                            required
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-neon-pink focus:border-neon-pink outline-none transition-all"
                            placeholder="Ex: Campanha Retenção Q1"
                        />
                    </div>

                    {/* Descricao */}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-700">Descrição</label>
                        <textarea
                            value={descricao}
                            onChange={e => setDescricao(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-neon-pink focus:border-neon-pink outline-none transition-all"
                            rows={3}
                            placeholder="Detalhes opcionais..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Tipo */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Tipo de Base</label>
                            <select
                                value={type}
                                onChange={e => setType(e.target.value)}
                                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="COCKPIT">Cockpit (Leads)</option>
                                <option value="MAPA_PARQUE">Mapa Parque (Base Visão)</option>
                            </select>
                        </div>

                        {/* Office */}
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-slate-700">Escritório</label>
                            {canSelectOffice ? (
                                <select
                                    value={office}
                                    onChange={e => setOffice(e.target.value)}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                                >
                                    <option value="">Selecione...</option>
                                    {offices.map(off => (
                                        <option key={off.id} value={off.office || off.code}>
                                            {off.name} ({off.code})
                                        </option>
                                    ))}
                                    <option value="SAFE_TI">SAFE TI (Default)</option>
                                    <option value="JLC_TECH">JLC TECH</option>
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    disabled
                                    value={office}
                                    className="w-full border rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-500"
                                />
                            )}
                        </div>
                    </div>

                    {message && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                            {message}
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-neon-pink text-white font-bold py-2.5 rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
                        >
                            {loading ? "Criando..." : "Criar Campanha"}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
