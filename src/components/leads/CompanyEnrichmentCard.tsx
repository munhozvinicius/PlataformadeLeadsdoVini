import React from "react";
import { Users, DollarSign, Activity, Globe } from "lucide-react";

type CompanyData = {
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    capital_social?: number;
    cnae_fiscal_descricao?: string;
    qsa?: Array<{
        nome_socio: string;
        qualificacao_socio?: string;
    }>;
};

type Props = {
    data: CompanyData | null;
    loading: boolean;
    onEnrich: () => void;
};

export function CompanyEnrichmentCard({ data, loading, onEnrich }: Props) {
    const formatCurrency = (val?: number) =>
        val ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val) : '-';

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
                <button
                    onClick={onEnrich}
                    disabled={loading}
                    className="text-[10px] font-black uppercase tracking-widest bg-neon-blue text-black px-3 py-1.5 hover:bg-cyan-300 disabled:opacity-50 transition-colors"
                >
                    {loading ? "Buscando..." : "Atualizar Dados"}
                </button>
            </div>

            {/* Conteúdo */}
            {!data ? (
                <div className="p-8 text-center">
                    <p className="text-slate-500 font-mono text-xs">Nenhum dado enriquecido disponível.</p>
                    <p className="text-slate-600 text-[10px] mt-1">Clique para buscar dados na Receita Federal.</p>
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

                    {/* Atividade e Capital */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-400 mb-1">
                            <Activity size={12} />
                            <span className="text-[10px] uppercase tracking-widest font-bold">Atividade Principal</span>
                        </div>
                        <div className="bg-black/30 p-2 border border-slate-800">
                            <p className="text-xs text-slate-300 font-mono leading-tight">
                                {data.cnae_fiscal_descricao || "Não disponível"}
                            </p>
                        </div>
                    </div>

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

                </div>
            )}
        </div>
    );
}
