import { MessageCircle } from "lucide-react";

export function Footer() {
    return (
        <footer className="bg-pic-dark border-t border-pic-zinc py-6 px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-slate-500 uppercase tracking-widest">
            <div>
                <span className="text-neon-pink">PIC &copy;</span> • Desenvolvido por <span className="text-white font-bold">Vinicius Munhoz</span>
            </div>

            <a
                href="https://wa.me/5517997238888"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-green-400 transition-colors group"
            >
                <MessageCircle size={14} className="group-hover:animate-pulse" />
                <span>Suporte: (17) 99723-8888</span>
            </a>
        </footer>
    );
}
