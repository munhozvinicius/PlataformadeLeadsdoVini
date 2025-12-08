"use client";

import { useState, useEffect } from "react";
import { Upload, Filter, Database, Plus, Search, Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";

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
    // Filter State
    const [filters, setFilters] = useState({
        cidade: "",
        vertical: "",
        officeName: "",
        flgCobertura: false, // New Flag Filter
        productRules: [] as { id: string, field: string, operator: string, value: number }[]
    });

    // Preview State
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [previewData, setPreviewData] = useState<{ count: number, items: any[] } | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [page, setPage] = useState(1);

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

    const PRODUCT_FIELDS = [
        { label: "Móvel (Qtd)", value: "qtMovelTerm" },
        { label: "Móvel Pen (Qtd)", value: "qtMovelPen" },
        { label: "Banda Larga (Qtd)", value: "qtBasicaBl" },
        { label: "Fibra (Qtd)", value: "qtBasicaFibra" },
        { label: "Vivo Tech (Qtd)", value: "qtVivoTech" },
        { label: "Office 365 (Qtd)", value: "qtOffice365" },
    ];

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

    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const handleUpload = async () => {
        if (!uploadFile) return;
        setIsLoading(true);
        setUploadStats(null);
        setProgress({ current: 0, total: 0 });

        try {
            if (uploadFile.name.toLowerCase().endsWith(".csv")) {
                await processCsvStreaming(uploadFile);
            } else {
                await processExcelLegacy(uploadFile);
            }
        } catch (err) {
            console.error(err);
            const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
            alert("Erro no upload: " + errorMessage);
        } finally {
            setIsLoading(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processExcelLegacy = async (file: File) => {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[];

        if (rawRows.length === 0) throw new Error("Arquivo vazio");

        // Find Header
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
            const row = rawRows[i];
            if (row.some((cell: string) => String(cell).toUpperCase().includes("CNPJ"))) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) throw new Error("Coluna CNPJ não encontrada nas primeiras 20 linhas");

        const headers = rawRows[headerRowIndex].map((h: string) => String(h).trim());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const jsonData: any[] = [];

        for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const obj: any = {};
            headers.forEach((header: string, index: number) => {
                if (header) obj[header] = row[index];
            });
            jsonData.push(obj);
        }

        await uploadBatches(jsonData);
    };

    const processCsvStreaming = async (file: File) => {
        const Papa = (await import("papaparse")).default;

        let headerMap: string[] | null = null;
        let batch: any[] = [];
        const BATCH_SIZE = 1000;
        let processedRows = 0;
        const aggregatedStats = { created: 0, updated: 0, historyCreated: 0, errors: 0 };
        const batchId = new Date().toISOString();

        return new Promise<void>((resolve, reject) => {
            Papa.parse(file, {
                header: false,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                chunk: async (results, parser) => {
                    parser.pause(); // Pause to handle async upload

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rows = results.data as any[];
                    let startIndex = 0;

                    // 1. Find Header if not found
                    if (!headerMap) {
                        for (let i = 0; i < rows.length; i++) {
                            const row = rows[i];
                            if (Array.isArray(row) && row.some((cell: string) => String(cell).toUpperCase().includes("CNPJ"))) {
                                headerMap = row.map((h: string) => String(h).trim());
                                startIndex = i + 1;
                                break;
                            }
                        }
                    }

                    // 2. Process Rows
                    if (headerMap) {
                        for (let i = startIndex; i < rows.length; i++) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const row = rows[i] as any[];
                            if (!row || row.length === 0) continue;

                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const obj: any = {};
                            headerMap.forEach((header, idx) => {
                                if (header) obj[header] = row[idx];
                            });
                            batch.push(obj);
                        }
                    }

                    // 3. Upload Batch if full
                    if (batch.length >= BATCH_SIZE) {
                        try {
                            const stats = await sendBatch(batch, batchId);
                            // Merge stats
                            aggregatedStats.created += stats.created;
                            aggregatedStats.updated += stats.updated;
                            aggregatedStats.historyCreated += stats.historyCreated;
                            aggregatedStats.errors += stats.errors;

                            processedRows += batch.length;
                            setProgress({ current: processedRows, total: 0 }); // Unknown total for stream, show count

                            batch = []; // Clear batch

                        } catch (err) {
                            console.error("Batch upload failed", err);
                            // Optionally capture global error or count as errors
                            aggregatedStats.errors += batch.length;
                            batch = [];
                        }
                    }

                    parser.resume();
                },
                complete: async () => {
                    // Send remaining
                    if (batch.length > 0) {
                        try {
                            const stats = await sendBatch(batch, batchId);
                            aggregatedStats.created += stats.created;
                            aggregatedStats.updated += stats.updated;
                            aggregatedStats.historyCreated += stats.historyCreated;
                            aggregatedStats.errors += stats.errors;
                            processedRows += batch.length;
                        } catch (err) {
                            console.error("Final batch error", err);
                            aggregatedStats.errors += batch.length;
                        }
                    }

                    setUploadStats({
                        success: true,
                        message: `Upload finalizado. Total processado: ${processedRows}`,
                        stats: aggregatedStats
                    });
                    resolve();
                },
                error: (err: Error) => reject(err)
            });
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadBatches = async (allData: any[]) => {
        const batchId = new Date().toISOString();
        const BATCH_SIZE = 1000;
        const aggregatedStats = { created: 0, updated: 0, historyCreated: 0, errors: 0 };

        for (let i = 0; i < allData.length; i += BATCH_SIZE) {
            const chunk = allData.slice(i, i + BATCH_SIZE);
            setProgress({ current: i + chunk.length, total: allData.length });
            try {
                const stats = await sendBatch(chunk, batchId);
                aggregatedStats.created += stats.created;
                aggregatedStats.updated += stats.updated;
                aggregatedStats.historyCreated += stats.historyCreated;
                aggregatedStats.errors += stats.errors;
            } catch (err) {
                console.error("Batch error", err);
                aggregatedStats.errors += chunk.length;
            }
        }

        setUploadStats({
            success: true,
            message: `Upload finalizado. Processados ${allData.length} registros.`,
            stats: aggregatedStats
        });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendBatch = async (records: any[], batchId: string) => {
        const res = await fetch("/api/intelligence/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records, batchId })
        });
        if (!res.ok) throw new Error("Failed to upload batch");
        const data = await res.json();
        return data.stats || { created: 0, updated: 0, historyCreated: 0, errors: records.length };
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
            setIsPreviewLoading(false);
        }
    };

    const fetchPreview = async (newPage = 1) => {
        setIsPreviewLoading(true);
        try {
            const res = await fetch("/api/intelligence/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filters,
                    page: newPage,
                    pageSize: 20
                })
            });
            const data = await res.json();
            setPreviewData(data);
            setPage(newPage);
        } catch (error) {
            console.error(error);
        } finally {
            setIsPreviewLoading(false);
        }
    };

    const addProductRule = () => {
        setFilters(prev => ({
            ...prev,
            productRules: [
                ...prev.productRules,
                { id: Math.random().toString(36).substr(2, 9), field: "qtMovelTerm", operator: "gt", value: 0 }
            ]
        }));
    };

    const removeProductRule = (id: string) => {
        setFilters(prev => ({
            ...prev,
            productRules: prev.productRules.filter(r => r.id !== id)
        }));
    };

    const updateProductRule = (id: string, key: string, val: string | number) => {
        setFilters(prev => ({
            ...prev,
            productRules: prev.productRules.map(r => r.id === id ? { ...r, [key]: val } : r)
        }));
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
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="animate-spin w-5 h-5" />
                                    {progress.total > 0 ? `Processando ${Math.round((progress.current / progress.total) * 100)}%...` : "Processando..."}
                                </span>
                            ) : "Processar Arquivo"}
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

                        {/* Product Rules */}
                        <div className="mt-6 pt-6 border-t border-pic-border space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Regras de Produto</label>
                                <button onClick={addProductRule} className="text-neon-green text-xs hover:underline flex items-center">
                                    <Plus className="w-3 h-3 mr-1" /> Adicionar
                                </button>
                            </div>

                            {filters.productRules.map(rule => (
                                <div key={rule.id} className="bg-pic-dark border border-pic-border rounded p-2 flex gap-2 items-center">
                                    <div className="flex-1 grid grid-cols-1 gap-2">
                                        <select
                                            value={rule.field}
                                            onChange={(e) => updateProductRule(rule.id, "field", e.target.value)}
                                            className="bg-black/20 border border-pic-zinc rounded text-xs text-white p-1"
                                        >
                                            {PRODUCT_FIELDS.map(f => (
                                                <option key={f.value} value={f.value}>{f.label}</option>
                                            ))}
                                        </select>
                                        <div className="flex gap-2">
                                            <select
                                                value={rule.operator}
                                                onChange={(e) => updateProductRule(rule.id, "operator", e.target.value)}
                                                className="bg-black/20 border border-pic-zinc rounded text-xs text-white p-1 w-20"
                                            >
                                                <option value="gt">Maior que</option>
                                                <option value="lt">Menor que</option>
                                                <option value="equals">Igual a</option>
                                            </select>
                                            <input
                                                type="number"
                                                value={rule.value}
                                                onChange={(e) => updateProductRule(rule.id, "value", e.target.value)}
                                                className="bg-black/20 border border-pic-zinc rounded text-xs text-white p-1 flex-1 min-w-0"
                                            />
                                        </div>
                                    </div>
                                    <button onClick={() => removeProductRule(rule.id)} className="text-slate-500 hover:text-red-500">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
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
                            {isPreviewLoading ? (
                                <Loader2 className="animate-spin text-neon-blue w-8 h-8" />
                            ) : (
                                <span className={`text-4xl font-black ${previewData?.count ? "text-white" : "text-slate-600"}`}>
                                    {previewData ? previewData.count.toLocaleString() : "---"}
                                </span>
                            )}
                            <p className="text-[10px] text-slate-600 mt-2 max-w-[200px]">
                                Selecione filtros e clique em Simular para verificar a contagem.
                            </p>
                            <button
                                onClick={() => fetchPreview(1)}
                                className="mt-4 text-xs font-bold text-neon-blue border border-neon-blue/30 px-3 py-1 rounded hover:bg-neon-blue/10 transition-colors"
                            >
                                {previewData ? "Atualizar Contagem" : "Simular Contagem"}
                            </button>
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

            {/* RESULTS GRID (FULL WIDTH BELOW) */}
            {previewData && activeTab === "explore" && (
                <section className="mt-8 animate-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Database className="w-5 h-5 text-neon-blue" />
                            Prévia dos Dados ({previewData.count})
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fetchPreview(page - 1)}
                                disabled={page === 1 || isPreviewLoading}
                                className="p-2 border border-pic-zinc rounded hover:bg-pic-dark text-slate-400 disabled:opacity-50"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="flex items-center text-sm text-slate-500 font-mono px-2">
                                Página {page}
                            </span>
                            <button
                                onClick={() => fetchPreview(page + 1)}
                                disabled={!previewData.items.length || isPreviewLoading}
                                className="p-2 border border-pic-zinc rounded hover:bg-pic-dark text-slate-400 disabled:opacity-50"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    <div className="bg-pic-card border border-pic-border rounded-xl overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-black/40 text-slate-400 font-bold border-b border-pic-border">
                                <tr>
                                    <th className="px-4 py-3">CNPJ</th>
                                    <th className="px-4 py-3">Razão Social</th>
                                    <th className="px-4 py-3">Cidade / UF</th>
                                    <th className="px-4 py-3">Vertical</th>
                                    <th className="px-4 py-3">Móvel</th>
                                    <th className="px-4 py-3">Fibra</th>
                                    <th className="px-4 py-3">Office 365</th>
                                    <th className="px-4 py-3">Flags</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-pic-border/50">
                                {previewData.items.map((item) => (
                                    <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3 font-mono text-slate-500">{item.cnpj}</td>
                                        <td className="px-4 py-3 text-white font-medium">{item.razaoSocial}</td>
                                        <td className="px-4 py-3 text-slate-400">{item.cidade} - {item.uf}</td>
                                        <td className="px-4 py-3 text-slate-400">{item.vertical}</td>
                                        <td className={`px-4 py-3 font-mono ${item.qtMovelTerm > 0 ? "text-neon-green" : "text-slate-600"}`}>{item.qtMovelTerm}</td>
                                        <td className={`px-4 py-3 font-mono ${item.qtBasicaFibra > 0 ? "text-neon-green" : "text-slate-600"}`}>{item.qtBasicaFibra}</td>
                                        <td className={`px-4 py-3 font-mono ${item.qtOffice365 > 0 ? "text-neon-green" : "text-slate-600"}`}>{item.qtOffice365}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1">
                                                {item.flgCobertura === "1" && <span className="text-[10px] bg-neon-pink/10 text-neon-pink border border-neon-pink/30 px-1 rounded">FIBRA</span>}
                                                {item.flgMei === "SIM" && <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1 rounded">MEI</span>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {previewData.items.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                            Nenhum registro encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}
