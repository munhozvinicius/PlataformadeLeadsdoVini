"use client";

import { useState, useEffect } from "react";
import { Upload, Filter, Database, Plus, Search, Loader2 } from "lucide-react";

export default function IntelligencePage() {
    const [activeTab, setActiveTab] = useState<"base" | "explore">("base");
    const [isLoading, setIsLoading] = useState(false);

    // Upload State
    interface UploadResponse {
        success: boolean;
        stats: {
            created: number;
            updated: number;
            historyCreated: number;
            errors: number;
        };
        message: string;
    }

    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadStats, setUploadStats] = useState<UploadResponse | null>(null);

    // Filter State
    const [filters, setFilters] = useState({
        cidade: "",
        vertical: "",
        officeName: "",
        flgCobertura: false, // New Flag Filter
        productRules: [] as { field: string, operator: string, value: number }[]
    });

    // Office Data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [offices, setOffices] = useState<any[]>([]);

    // Campaign Config State
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
                // Reset or redirect logic can go here
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
        <div className="p-8 max-w-[1600px] mx-auto pb-24">
            <header className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">
                        INTELIGÊNCIA <span className="text-neon-blue">MAPA PARQUE</span>
                    </h1>
                    <p className="text-slate-400">
                        Gestão da base de clientes, filtros avançados e criação de campanhas inteligentes.
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
                <div className="grid grid-cols-12 gap-6 items-start">
                    {/* COL 1: FILTERS */}
                    <aside className="col-span-3 bg-pic-card border border-pic-border rounded-xl p-5 sticky top-24">
                        <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                            <Filter className="w-4 h-4 text-neon-blue" />
                            1. Filtros de Busca
                        </h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Cobertura / Flags</label>

                                <label className="flex items-center gap-3 p-3 bg-pic-dark border border-pic-border rounded-lg cursor-pointer hover:border-neon-pink transition-colors group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${filters.flgCobertura ? "bg-neon-pink border-neon-pink" : "border-slate-600 group-hover:border-neon-pink"}`}>
                                        {filters.flgCobertura && <div className="w-2.5 h-2.5 bg-white rounded-sm" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={filters.flgCobertura}
                                        onChange={(e) => setFilters({ ...filters, flgCobertura: e.target.checked })}
                                    />
                                    <span className={`text-sm font-medium ${filters.flgCobertura ? "text-white" : "text-slate-400 group-hover:text-white"}`}>
                                        Com Cobertura Fibra (1)
                                    </span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Cidade (Contém)</label>
                                <input
                                    type="text"
                                    value={filters.cidade}
                                    onChange={e => setFilters({ ...filters, cidade: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none text-white placeholder-slate-600"
                                    placeholder="Ex: São Paulo"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Vertical</label>
                                <input
                                    type="text"
                                    value={filters.vertical}
                                    onChange={e => setFilters({ ...filters, vertical: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm focus:border-neon-blue outline-none text-white placeholder-slate-600"
                                    placeholder="Ex: Serviços"
                                />
                            </div>
                        </div>
                    </aside>

                    {/* COL 2: CAMPAIGN CONFIG */}
                    <section className="col-span-5 bg-pic-card border border-pic-border rounded-xl p-5 sticky top-24">
                        <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                            <Database className="w-4 h-4 text-neon-pink" />
                            2. Configuração da Campanha
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Escritório Responsável</label>
                                <select
                                    value={campaignConfig.officeId}
                                    onChange={(e) => setCampaignConfig({ ...campaignConfig, officeId: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm text-white focus:border-neon-pink outline-none appearance-none cursor-pointer hover:border-slate-500 transition-colors"
                                >
                                    <option value="">Selecione o Escritório...</option>
                                    {offices.map(office => (
                                        <option key={office.id} value={office.id}>{office.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1">Torre (Objetivo)</label>
                                    <select
                                        value={campaignConfig.tower}
                                        onChange={(e) => setCampaignConfig({ ...campaignConfig, tower: e.target.value, subTower: "" })}
                                        className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm text-white focus:border-neon-pink outline-none appearance-none cursor-pointer hover:border-slate-500 transition-colors"
                                    >
                                        <option value="">Selecione...</option>
                                        {Object.keys(TOWER_OPTIONS).map(tower => (
                                            <option key={tower} value={tower}>{tower}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-400 mb-1">Sub-Torre (Detalhe)</label>
                                    <select
                                        value={campaignConfig.subTower}
                                        onChange={(e) => setCampaignConfig({ ...campaignConfig, subTower: e.target.value })}
                                        className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm text-white focus:border-neon-pink outline-none appearance-none cursor-pointer hover:border-slate-500 transition-colors disabled:opacity-50"
                                        disabled={!campaignConfig.tower}
                                    >
                                        <option value="">Selecione...</option>
                                        {campaignConfig.tower && TOWER_OPTIONS[campaignConfig.tower as keyof typeof TOWER_OPTIONS].map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-1">Nome Personalizado (Sufixo)</label>
                                <input
                                    type="text"
                                    value={campaignConfig.customName}
                                    onChange={e => setCampaignConfig({ ...campaignConfig, customName: e.target.value })}
                                    className="w-full bg-pic-dark border border-pic-border rounded-lg px-3 py-2 text-sm focus:border-neon-pink outline-none text-white placeholder-slate-600"
                                    placeholder="Ex: Foco Q1 2025"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Nome Final: <span className="text-slate-300">[{campaignConfig.tower || "Torre"}] - {campaignConfig.subTower ? `${campaignConfig.subTower} - ` : ""}{campaignConfig.customName || "Personalizado"} - {new Date().toLocaleDateString('pt-BR')}</span>
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* COL 3: SIMULATION & ACTION */}
                    <section className="col-span-4 bg-pic-card border border-pic-border rounded-xl p-5 sticky top-24 flex flex-col h-[300px]">
                        <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
                            <Search className="w-4 h-4 text-neon-green" />
                            3. Simulação & Disparo
                        </h3>

                        <div className="flex-1 bg-pic-dark/30 rounded-lg border-2 border-dashed border-pic-border flex flex-col items-center justify-center p-4 text-center">
                            <span className="text-slate-500 text-sm mb-2">Leads Encontrados</span>
                            <span className="text-4xl font-black text-white">---</span>
                            <p className="text-[10px] text-slate-600 mt-2 max-w-[200px]">
                                Selecione filtros e configure a campanha para verificar a contagem.
                            </p>
                        </div>

                        <button
                            onClick={handleGenerateCampaign}
                            disabled={isLoading || !campaignConfig.tower || !campaignConfig.officeId}
                            className="w-full mt-4 bg-neon-green text-black font-bold py-3 rounded-lg hover:bg-neon-green/90 transition-all shadow-lg shadow-neon-green/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                <>
                                    <Plus className="w-5 h-5" />
                                    Gerar Campanha
                                </>
                            )}
                        </button>
                    </section>
                </div>
            )}
        </div>
    );
}
