
"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useSession } from "next-auth/react";

type Announcement = {
    id: string;
    title: string;
    message: string;
    imageUrl?: string;
};

export function AnnouncementPopup() {
    const { status } = useSession();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (status === "authenticated") {
            fetch("/api/announcements/active")
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data) && data.length > 0) {
                        setAnnouncements(data);
                        setIsOpen(true);
                    }
                })
                .catch(console.error);
        }
    }, [status]);

    const handleClose = async () => {
        const current = announcements[currentIndex];

        // Mark as read
        try {
            await fetch(`/api/announcements/${current.id}/read`, { method: "POST" });
        } catch (e) {
            console.error("Error marking as read", e);
        }

        // Show next or close
        if (currentIndex < announcements.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsOpen(false);
        }
    };

    if (!isOpen || announcements.length === 0) return null;

    const current = announcements[currentIndex];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-pic-dark border-2 border-neon-pink rounded-xl max-w-md w-full shadow-[0_0_30px_rgba(255,0,153,0.3)] overflow-hidden relative animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-pic-card p-4 border-b border-white/10 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-neon-pink">
                        <Bell className="w-5 h-5 fill-neon-pink" />
                        <span className="font-bold uppercase tracking-wider text-sm">Comunicado Oficial</span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-0">
                    {current.imageUrl && (
                        <div className="w-full h-48 bg-black relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={current.imageUrl}
                                alt="Comunicado"
                                className="w-full h-full object-cover opacity-90"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-pic-dark to-transparent" />
                        </div>
                    )}

                    <div className="p-6">
                        <h2 className="text-xl font-black text-white mb-4 uppercase leading-tight">
                            {current.title}
                        </h2>
                        <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                            {current.message}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-pic-card/50 border-t border-white/10 flex justify-between items-center">
                    <span className="text-xs text-slate-500 font-mono">
                        {currentIndex + 1} de {announcements.length}
                    </span>
                    <button
                        onClick={handleClose}
                        className="bg-neon-pink hover:bg-neon-pink/90 text-black font-bold uppercase text-xs px-6 py-2.5 rounded transition-all shadow-lg shadow-neon-pink/20"
                    >
                        {currentIndex < announcements.length - 1 ? "Próximo" : "Entendi & Fechar"}
                    </button>
                </div>
            </div>
        </div>
    );
}
