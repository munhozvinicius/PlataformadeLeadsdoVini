import React from "react";
import { Users, DollarSign, Activity, Globe, Linkedin, Instagram, Newspaper, Phone } from "lucide-react";

type CompanyData = {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    capital_social?: number;
    cnae_fiscal_descricao?: string;
    // Porte added from backend
    porte?: string;
    main_phone?: string;
    secondary_phone?: string;
    qsa?: Array<{
        nome_socio: string;
        qualificacao_socio?: string;
    }>;
};

type Props = {
    data: CompanyData | null;
    loading: boolean;
    onEnrich: () => void;
    companyName?: string;
    city?: string;
};

export function CompanyEnrichmentCard({ data, loading, onEnrich, companyName, city }: Props) {
    const formatCurrency = (val?: number) =>
        val ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : '-';

    const cleanName = (companyName || "Empresa").replace(/[^\w\s]/g, "").trim();
    const mapsQuery = encodeURIComponent(`${cleanName} ${city || ""}`.trim());
    // Use Google Site Search for Instagram which is more reliable than internal tag search
    const instaQuery = encodeURIComponent(`site:instagram.com ${cleanName} ${city || ""}`);
    // General Google Search
    const googleQuery = encodeURIComponent(`${cleanName} ${city || "Empresa"} contato`);
    const linkedinQuery = encodeURIComponent(`site:linkedin.com/company ${cleanName}`);

    return (
        <div className="border border-neon-blue/30 bg-pic-card p-0 overflow-hidden shadow-[0_0_20px_rgba(0,240,255,0.1)] transition-all hover:border-neon-blue">
            {/* Header com Ação */}
            <div className="bg-pic-dark border-b border-slate-800 p-4 flex justify-between items-center bg-[url('/grid.svg')]">
                <div className="flex items-center gap-2">
                    <div className="bg-neon-blue/20 p-1.5 rounded">
                        <Globe className="text-neon-blue w-4 h-4" />
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Inteligência de Dados <span className="text-neon-blue text-[10px] ml-1 border border-neon-blue px-1 rounded-sm">BETA</span>
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    {/* Social Search Shortcuts */}
                    <div className="flex mr-2 border-r border-slate-700 pr-2 gap-1">
                        <a
                            href={`https://www.google.com/search?q=${linkedinQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-pic-zinc rounded text-slate-400 hover:text-[#0077b5] transition-colors"
                            title="Buscar no LinkedIn"
                        >
                            <Linkedin size={14} />
                        </a>
                        <a
                            href={`https://www.google.com/search?q=${instaQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-pic-zinc rounded text-slate-400 hover:text-[#E1306C] transition-colors"
                            title="Buscar Instagram (via Google)"
                        >
                            <Instagram size={14} />
                        </a>
                        <a
                            href={`https://www.google.com/search?q=${googleQuery}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 hover:bg-pic-zinc rounded text-slate-400 hover:text-green-400 transition-colors"
                            title="Buscar no Google"
                        >
                            <Newspaper size={14} />
                        </a>
                    </div>

                    <a
                        href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center gap-1 border border-slate-700 px-2 py-1.5"
                        title="Buscar no Google Maps"
                    >
                        Google Maps ↗
                    </a>
                    <button
                        onClick={onEnrich}
                        disabled={loading}
                        className="text-[10px] font-black uppercase tracking-widest bg-neon-blue text-black px-3 py-1.5 hover:bg-cyan-300 disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Buscando..." : "Atualizar Dados"}
                    </button>
                </div>
            </div>

            {/* Conteúdo */}
            {!data ? (
                <div className="p-8 text-center bg-stripes-zinc">
                    {loading ? (
                        <p className="text-neon-blue text-xs animate-pulse">Consultando fontes oficiais (Receita/BrasilAPI)...</p>
                    ) : (
                        <>
                            <p className="text-slate-500 font-mono text-xs mb-1">Dados não carregados ou serviço indisponível.</p>
                            <p className="text-slate-600 text-[10px]">Utilize os botões de busca externa acima.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Sócios (Critical for B2B) */}
                    <div className="col-span-1 md:col-span-2 space-y-2">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Users size={12} />
                            <span className="text-[10px] uppercase tracking-widest font-bold">Quadro Societário (Decisores)</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {data.qsa?.map((socio, idx) => (
                                <div key={idx} className="bg-black/50 border-l-2 border-neon-pink p-2">
                                    <p className="text-white font-bold text-xs uppercase truncate" title={socio.nome_socio}>{socio.nome_socio}</p>
                                    <p className="text-[10px] text-slate-500 truncate">{socio.qualificacao_socio}</p>
                                </div>
                            ))}
                            {(!data.qsa || data.qsa.length === 0) && <p className="text-xs text-slate-600 italic">Sócios não informados.</p>}
                        </div>
                    </div>

                    {/* Atividade */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Activity size={12} />
                            <span className="text-[10px] uppercase tracking-widest font-bold">Atividade Principal</span>
                        </div>
                        <div className="bg-black/30 p-2 border border-slate-800 h-full">
                            <p className="text-xs text-slate-300 font-mono leading-tight">
                                {data.cnae_fiscal_descricao || "Não disponível"}
                            </p>
                        </div>
                    </div>

                    {/* Capital & Porte */}
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-slate-400 mb-1">
                                <DollarSign size={12} />
                                <span className="text-[10px] uppercase tracking-widest font-bold">Capital Social</span>
                            </div>
                            <div className="bg-black/30 p-2 border border-slate-800">
                                <p className="text-lg text-neon-green font-bold font-mono tracking-tighter">
                                    {formatCurrency(data.capital_social)}
                                </p>
                            </div>
                        </div>

                        {/* Porte / Funcionários (Estimated) */}
                        {data.porte && (
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Porte / Funcionários</span>
                                <div className="p-2 border border-slate-800 bg-slate-900/50">
                                    <p className="text-xs text-white font-bold">{data.porte}</p>
                                    <p className="text-[10px] text-slate-500">Estimativa baseada no porte</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Phones (New) */}
                    {(data.main_phone || data.secondary_phone) && (
                        <div className="col-span-1 md:col-span-2 bg-slate-900 border border-slate-700 p-2 flex gap-4 items-center">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Phone size={12} />
                                <span className="text-[10px] uppercase tracking-widest font-bold">Contatos Receita</span>
                            </div>
                            <div className="flex gap-3">
                                {data.main_phone && <span className="text-white font-mono text-xs border border-neon-green/30 px-2 py-0.5 rounded text-neon-green">{data.main_phone}</span>}
                                {data.secondary_phone && <span className="text-slate-400 font-mono text-xs">{data.secondary_phone}</span>}
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
