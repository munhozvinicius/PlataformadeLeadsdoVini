
"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Image as ImageIcon, Users, Eye } from "lucide-react";

type Announcement = {
    id: string;
    title: string;
    message: string;
    imageUrl?: string | null;
    createdAt: string;
    totalReaders: number;
    totalTargets: number;
    seenPercentage: number;
};

export default function AdminAnnouncementsPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Form State
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [imageUrl, setImageUrl] = useState("");

    const fetchAnnouncements = async () => {
        setLoading(true);
        const res = await fetch("/api/admin/announcements");
        if (res.ok) {
            setAnnouncements(await res.json());
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchAnnouncements();
    }, []);

    const handleCreate = async () => {
        if (!title || !message) return;

        const res = await fetch("/api/admin/announcements", {
            method: "POST",
            body: JSON.stringify({ title, message, imageUrl }),
            headers: { "Content-Type": "application/json" }
        });

        if (res.ok) {
            setIsCreating(false);
            setTitle("");
            setMessage("");
            setImageUrl("");
            fetchAnnouncements();
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja excluir este comunicado?")) return;

        await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
        fetchAnnouncements();
    };

    return (
        <div className="min-h-screen bg-pic-dark -m-6 p-6">
            <div className="max-w-6xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex justify-between items-end border-b border-pic-zinc pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-1">
                            Comunicados <span className="text-neon-pink">Internos</span>
                        </h1>
                        <p className="text-slate-400 text-sm">Gerencie avisos e novidades para a equipe.</p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="bg-neon-pink hover:bg-neon-pink/90 text-black font-bold uppercase text-xs px-4 py-2 rounded flex items-center gap-2 transition-colors"
                    >
                        <Plus size={16} /> Novo Comunicado
                    </button>
                </div>

                {/* Create Form */}
                {isCreating && (
                    <div className="bg-pic-card border border-neon-pink/50 rounded-xl p-6 animate-in slide-in-from-top-4">
                        <h2 className="text-lg font-bold text-white mb-4 uppercase">Novo Comunicado</h2>
                        <div className="grid gap-4">
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Título</label>
                                <input
                                    className="w-full bg-black/50 border border-pic-zinc rounded p-2 text-white focus:border-neon-pink outline-none"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Ex: Atualização no Sistema..."
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">Mensagem</label>
                                <textarea
                                    className="w-full bg-black/50 border border-pic-zinc rounded p-2 text-white focus:border-neon-pink outline-none h-32"
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Digite o conteúdo do comunicado..."
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-slate-500 mb-1 block">URL da Imagem (Opcional)</label>
                                <div className="flex gap-2">
                                    <input
                                        className="flex-1 bg-black/50 border border-pic-zinc rounded p-2 text-white focus:border-neon-pink outline-none"
                                        value={imageUrl}
                                        onChange={e => setImageUrl(e.target.value)}
                                        placeholder="https://..."
                                    />
                                    {imageUrl && (
                                        <div className="w-10 h-10 rounded overflow-hidden border border-pic-zinc bg-black">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                                <button
                                    onClick={() => setIsCreating(false)}
                                    className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold uppercase transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreate}
                                    className="px-6 py-2 bg-neon-green text-black font-bold uppercase text-xs rounded hover:bg-neon-green/90 transition-colors"
                                >
                                    Publicar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full text-center py-20 text-slate-500 animate-pulse">Carregando...</div>
                    ) : announcements.length === 0 ? (
                        <div className="col-span-full text-center py-20 border-2 border-dashed border-pic-zinc rounded-xl">
                            <p className="text-slate-500 uppercase font-mono">Nenhum comunicado ativo</p>
                        </div>
                    ) : (
                        announcements.map(ann => (
                            <div key={ann.id} className="bg-pic-card border border-pic-zinc rounded-xl overflow-hidden group hover:border-neon-blue transition-colors flex flex-col">
                                {ann.imageUrl ? (
                                    <div className="h-40 bg-black relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={ann.imageUrl} alt={ann.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute inset-0 bg-gradient-to-t from-pic-card to-transparent" />
                                    </div>
                                ) : (
                                    <div className="h-20 bg-gradient-to-br from-pic-zinc to-pic-card flex items-center justify-center">
                                        <ImageIcon className="text-slate-600 w-8 h-8" />
                                    </div>
                                )}

                                <div className="p-5 flex-1 flex flex-col">
                                    <h3 className="text-lg font-bold text-white uppercase leading-tight mb-2">{ann.title}</h3>
                                    <p className="text-slate-400 text-sm line-clamp-3 mb-4 flex-1">{ann.message}</p>

                                    <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                                        <div className="text-xs font-mono text-slate-500 flex flex-col">
                                            <span className="flex items-center gap-1 text-neon-blue">
                                                <Eye size={12} /> {Math.round(ann.seenPercentage * 100)}% Visualizado
                                            </span>
                                            <span className="text-[10px] mt-0.5">
                                                {ann.totalReaders} de {ann.totalTargets} active users
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(ann.id)}
                                            className="text-slate-600 hover:text-red-500 transition-colors p-2"
                                            title="Excluir"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
}
