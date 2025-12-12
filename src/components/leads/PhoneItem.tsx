import React from "react";
import { ThumbsUp, ThumbsDown, Phone, Flame } from "lucide-react";

type PhoneFeedback = "like" | "dislike" | null;

type PhoneItemProps = {
    phone: {
        valor: string;
        rotulo?: string;
        feedback?: PhoneFeedback;
        feedbackReason?: string | null;
    };
    onFeedback: (valor: string, feedback: PhoneFeedback) => void;
};

export function PhoneItem({ phone, onFeedback }: PhoneItemProps) {
    return (
        <div className="flex items-center justify-between bg-black border border-slate-800 p-3 group hover:border-neon-blue transition-colors">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-slate-900 text-neon-blue rounded-full">
                    {phone.feedback === "like" ? <Flame size={14} className="text-neon-pink" /> : <Phone size={14} />}
                </div>
                <div>
                    <p className="text-white font-mono text-sm leading-none mb-1">{phone.valor}</p>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">{phone.rotulo || "Telefone"}</p>
                    {phone.feedback === "dislike" && phone.feedbackReason ? (
                        <p className="text-[10px] text-red-400 mt-1">⚠ {phone.feedbackReason}</p>
                    ) : null}
                </div>
            </div>

            <div className="flex items-center gap-1">
                <button
                    onClick={() => onFeedback(phone.valor, phone.feedback === "like" ? null : "like")}
                    className={`p-2 rounded-sm transition-all ${phone.feedback === "like"
                            ? "bg-neon-green text-black"
                            : "text-slate-600 hover:text-neon-green hover:bg-slate-900"
                        }`}
                    title="Telefone Válido / Decisor"
                >
                    <ThumbsUp size={14} strokeWidth={3} />
                </button>
                <button
                    onClick={() => onFeedback(phone.valor, phone.feedback === "dislike" ? null : "dislike")}
                    className={`p-2 rounded-sm transition-all ${phone.feedback === "dislike"
                            ? "bg-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]"
                            : "text-slate-600 hover:text-red-500 hover:bg-slate-900"
                        }`}
                    title="Telefone Inválido / Errado"
                >
                    <ThumbsDown size={14} strokeWidth={3} />
                </button>
            </div>
        </div>
    );
}
