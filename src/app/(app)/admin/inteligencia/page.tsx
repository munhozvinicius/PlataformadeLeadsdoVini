"use client";

import { useState, useEffect } from "react";
import { Upload, Filter, Database, Plus, Search, Loader2 } from "lucide-react";

export default function IntelligencePage() {
    const [activeTab, setActiveTab] = useState<"base" | "explore">("explore");
    const [isLoading, setIsLoading] = useState(false);

    // Upload State
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadStats, setUploadStats] = useState<unknown>(null);

    // Filter State
    const [filters, setFilters] = useState({
        cidade: "",
        vertical: "",
        officeName: "",
        productRules: [] as { field: string, operator: string, value: number }[]
    });

    // Office Data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [offices, setOffices] = useState<any[]>([]);

    // Campaign Modal State
    const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
    const [campaignConfig, setCampaignConfig] = useState({
        tower: "",
        subTower: "",
        customName: "",
        officeId: ""
    });

    const TOWER_OPTIONS = {
        "Avançados": ["Voz Avançada", "VVN", "0800", "Dados Avançados", "Combo Voz + Dados"],
        "Móvel": ["Móvel Puro", "M2M"],
        "Fixa Básica": ["Linha Básica", "Banda Larga"],
        "TI (Digital)": ["Microsoft", "Google Workspace", "SD WAN", "MDM", "Antivirus"]
    };

    // Load offices on mount
    useEffect(() => {
        fetch("/api/admin/offices")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setOffices(data);
            })
            .catch(err => console.error("Error loading offices", err));
    }, []);

    // Mock Data (Replace with real API fetch later)
    // For V1 UI build, we assume user will hook up fetch

    const handleUpload = async () => {
        if (!uploadFile) return;
        setIsLoading(true);
        const formData = new FormData();
        formData.append("file", uploadFile);

        try {
            const res = await fetch("/api/intelligence/upload", {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            setUploadStats(data);
        } catch {
            alert("Erro no upload");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGenerateCampaign = async () => {
        if (!campaignConfig.tower) {
            alert("Selecione uma Torre");
            return;
        }
        setIsLoading(true);
        try {
            const res = await fetch("/api/intelligence/generate-campaign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filters,
                    ...campaignConfig
                })
            });
            const data = await res.json();
            if (data.success) {
                alert(`Campanha criada com sucesso! Leads: ${data.leadsCreated}`);
                setIsCampaignModalOpen(false);
            } else {
                alert("Erro: " + data.message);
            }
        } catch {
            alert("Erro ao criar campanha");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-[1600px] mx-auto text-slate-200">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                        Inteligência de Mercado
                    </h1>
                    <p className="text-slate-400">
                        Mapa Parque: Análise, Filtros e Geração de Campanhas
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab("explore")}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "explore" ? "bg-neon-blue/20 text-neon-blue border border-neon-blue/50" : "bg-pic-card border border-pic-border text-slate-400 hover:text-white"
                            }`}
                    >
                        <Search className="w-4 h-4 inline mr-2" />
                        Explorar & Campanhas
                    </button>
                    <button
                        onClick={() => setActiveTab("base")}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "base" ? "bg-neon-pink/20 text-neon-pink border border-neon-pink/50" : "bg-pic-card border border-pic-border text-slate-400 hover:text-white"
                            }`}
                    >
                        <Database className="w-4 h-4 inline mr-2" />
                        Gestão da Base
                    </button>
                </div>
            </header>

            {activeTab === "base" && (
                <div className="bg-pic-card border border-pic-border rounded-xl p-8 max-w-2xl mx-auto">
                    <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-neon-pink" />
                        Upload Mapa Parque
                    </h2>

                    <div className="border-2 border-dashed border-pic-border rounded-xl p-12 text-center hover:border-neon-pink/50 transition-colors bg-pic-dark/50">
                        <input
                            type="file"
                            accept=".xlsx, .csv"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            className="hidden"
                            id="file-upload"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                            <Upload className="w-12 h-12 text-slate-500 mb-4" />
                            <span className="text-lg font-medium text-white mb-2">
                                {uploadFile ? uploadFile.name : "Clique para selecionar o arquivo"}
                            </span>
                            <span className="text-sm text-slate-400">
                                Suporta .xlsx e .csv
                            </span>
                        </label>
                    </div>

                    {uploadFile && (
                        <button
                            onClick={handleUpload}
                            disabled={isLoading}
                            className="w-full mt-6 bg-neon-pink text-white font-bold py-3 rounded-lg hover:bg-neon-pink/90 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Processar Arquivo"}
                        </button>
                    )}

                    {uploadStats && (
                        <div className="mt-8 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                            <p className="text-green-400 font-medium mb-2">Upload Concluído!</p>
                            <ul className="text-sm text-slate-300 space-y-1">
                                <li>Criados: {uploadStats.stats.created}</li>
                                <li>Atualizados: {uploadStats.stats.updated}</li>
                                <li>Eventos de Histórico: {uploadStats.stats.historyCreated}</li>
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "explore" && (
                <div className="grid grid-cols-12 gap-8">
                    {/* Filters Sidebar */}
                    <aside className="col-span-3 bg-pic-card border border-pic-border rounded-xl p-6 h-fit sticky top-24">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Filter className="w-4 h-4 text-neon-blue" />
                            Filtros
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Cidade</label>
                                <input
                                    type="text"
                                    value={filters.cidade}
                                    onChange={e => setFilters({ ...filters, cidade: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none text-white"
                                    placeholder="Ex: São Paulo"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Vertical</label>
                                <input
                                    type="text"
                                    value={filters.vertical}
                                    onChange={e => setFilters({ ...filters, vertical: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none text-white"
                                    placeholder="Ex: Serviços"
                                />
                            </div>

                            <hr className="border-pic-border my-2" />

                            {/* Product Logic Placeholder */}
                            <div className="p-3 bg-pic-dark/50 rounded-lg border border-pic-border border-dashed text-center">
                                <p className="text-xs text-slate-500 mb-2">Regras de Produto</p>
                                <button className="text-xs text-neon-blue hover:text-white font-medium">
                                    + Adicionar Regra
                                </button>
                            </div>
                        </div>

                        <button
                            className="w-full mt-6 bg-neon-blue/10 border border-neon-blue/50 text-neon-blue hover:bg-neon-blue hover:text-black font-bold py-2 rounded-lg transition-all"
                            onClick={() => { /* Real search trigger would go here to refresh grid */ }}
                        >
                            Aplicar Filtros
                        </button>
                    </aside>

                    {/* Main Content */}
                    <main className="col-span-9">
                        <div className="bg-pic-card border border-pic-border rounded-xl p-6 min-h-[500px] flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-white">Resultados (Simulação)</h3>
                                <button
                                    onClick={() => setIsCampaignModalOpen(true)}
                                    className="bg-neon-pink text-white font-bold py-2 px-6 rounded-lg hover:bg-neon-pink/90 transition-shadow shadow-lg shadow-neon-pink/20 flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Criar Campanha
                                </button>
                            </div>

                            <div className="flex-1 flex items-center justify-center text-slate-500 flex-col gap-4">
                                <Database className="w-16 h-16 opacity-20" />
                                <p>Use os filtros para encontrar clientes na base Mapa Parque.</p>
                            </div>
                        </div>
                    </main>
                </div>
            )}

            {/* Campaign Creation Modal */}
            {isCampaignModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <div className="bg-pic-card border border-pic-border rounded-xl w-full max-w-lg p-8 shadow-2xl relative">
                        <button
                            onClick={() => setIsCampaignModalOpen(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-white"
                        >
                            ✕
                        </button>

                        <h2 className="text-2xl font-black text-white mb-1">Nova Campanha</h2>
                        <p className="text-slate-400 text-sm mb-6">Gerando campanha a partir da seleção atual.</p>

                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">Torre (Produto Principal)</label>
                                <select
                                    value={campaignConfig.tower}
                                    onChange={(e) => setCampaignConfig({ ...campaignConfig, tower: e.target.value, subTower: "" })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-4 py-3 text-white focus:border-neon-pink outline-none appearance-none"
                                >
                                    <option value="">Selecione uma Torre...</option>
                                    {Object.keys(TOWER_OPTIONS).map(tower => (
                                        <option key={tower} value={tower}>{tower}</option>
                                    ))}
                                </select>
                            </div>

                            {campaignConfig.tower && (
                                <div>
                                    <label className="block text-sm font-semibold text-white mb-2">Sub-Torre (Detalhe)</label>
                                    <select
                                        value={campaignConfig.subTower}
                                        onChange={(e) => setCampaignConfig({ ...campaignConfig, subTower: e.target.value })}
                                        className="w-full bg-pic-dark border border-pic-border rounded-lg px-4 py-3 text-white focus:border-neon-pink outline-none appearance-none"
                                    >
                                        <option value="">Selecione...</option>
                                        {/* @ts-expect-error - Dictionary indexing */}
                                        {TOWER_OPTIONS[campaignConfig.tower as keyof typeof TOWER_OPTIONS].map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">Escritório Responsável</label>
                                <select
                                    value={campaignConfig.officeId}
                                    onChange={(e) => setCampaignConfig({ ...campaignConfig, officeId: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-4 py-3 text-white focus:border-neon-pink outline-none appearance-none"
                                >
                                    <option value="">Selecione o Escritório...</option>
                                    {offices.map(office => (
                                        <option key={office.id} value={office.id}>{office.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-white mb-2">Nome Personalizado (Opcional)</label>
                                <input
                                    type="text"
                                    value={campaignConfig.customName}
                                    onChange={(e) => setCampaignConfig({ ...campaignConfig, customName: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-4 py-3 text-white focus:border-neon-pink outline-none"
                                    placeholder="Ex: Q4 Foco Churn"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Nome Final: <span className="text-neon-pink">[{campaignConfig.tower || "Torre"}] - {campaignConfig.subTower || "Sub"} - {campaignConfig.customName || "..."} - {new Date().toLocaleDateString('pt-BR')}</span>
                                </p>
                            </div>

                            <button
                                onClick={handleGenerateCampaign}
                                disabled={isLoading || !campaignConfig.tower || !campaignConfig.officeId}
                                className="w-full bg-neon-pink text-white font-bold py-4 rounded-lg hover:bg-neon-pink/90 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Gerando..." : "Confirmar e Criar Campanha"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
