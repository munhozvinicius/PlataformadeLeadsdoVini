"use client";

import { useState, useEffect } from "react";
import { Upload, FileUp, Database, ArrowLeft, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Office = {
    id: string;
    name: string;
    code: string;
};

export default function NovaCampanhaMapaParquePage() {
    const router = useRouter();
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [campaignName, setCampaignName] = useState("");
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Office Selection State
    const [availableOffices, setAvailableOffices] = useState<Office[]>([]);
    const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([]);
    const [isLoadingOffices, setIsLoadingOffices] = useState(true);

    useEffect(() => {
        const fetchOffices = async () => {
            try {
                const res = await fetch("/api/admin/offices");
                if (res.ok) {
                    const data = await res.json();
                    setAvailableOffices(data);
                }
            } catch (error) {
                console.error("Failed to fetch offices", error);
            } finally {
                setIsLoadingOffices(false);
            }
        };
        fetchOffices();
    }, []);

    const toggleOffice = (officeId: string) => {
        setSelectedOfficeIds(prev =>
            prev.includes(officeId)
                ? prev.filter(id => id !== officeId)
                : [...prev, officeId]
        );
    };

    const handleUpload = async () => {
        if (!uploadFile) return;
        if (!campaignName.trim()) {
            setStatus({ type: 'error', message: "Por favor, defina um nome para a campanha." });
            return;
        }
        if (selectedOfficeIds.length === 0) {
            setStatus({ type: 'error', message: "Selecione pelo menos um escritório participante." });
            return;
        }

        setIsLoading(true);
        setStatus(null);

        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("campaignName", campaignName);
        selectedOfficeIds.forEach(id => formData.append("officeIds", id));

        try {
            const res = await fetch("/api/campanhas/mapa-parque/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (res.ok) {
                setStatus({ type: 'success', message: `Campanha criada com sucesso! ${data.leadsCount} leads importados.` });
                setTimeout(() => {
                    router.push("/admin/campanhas");
                }, 2000);
            } else {
                setStatus({ type: 'error', message: data.message || "Erro ao criar campanha." });
            }
        } catch (error) {
            console.log(error);
            setStatus({ type: 'error', message: "Erro de conexão ao enviar arquivo." });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto min-h-screen">
            <div className="mb-8">
                <Link href="/admin/campanhas" className="inline-flex items-center text-sm text-slate-500 hover:text-neon-blue mb-4 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Voltar para Campanhas
                </Link>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
                    <Database className="w-8 h-8 text-neon-pink" />
                    Nova Campanha <span className="text-neon-blue">Mapa Parque</span>
                </h1>
                <p className="text-slate-500 mt-2">
                    Importe leads da base e selecione os escritórios que trabalharão nela.
                </p>
            </div>

            <div className="space-y-6">
                {/* Campaign Details */}
                <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                            Nome da Campanha
                        </label>
                        <input
                            type="text"
                            value={campaignName}
                            onChange={(e) => setCampaignName(e.target.value)}
                            placeholder="Ex: Base Avançada Q1 2024"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wide">
                            Escritórios Participantes (Quem recebe leads?)
                        </label>
                        {isLoadingOffices ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" /> Carregando escritórios...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {availableOffices.map((office) => {
                                    const isSelected = selectedOfficeIds.includes(office.id);
                                    return (
                                        <button
                                            key={office.id}
                                            onClick={() => toggleOffice(office.id)}
                                            className={`flex items-center p-3 rounded-lg border text-sm font-medium transition-all ${isSelected
                                                    ? 'bg-neon-blue/10 border-neon-blue text-neon-blue'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                }`}
                                        >
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 ${isSelected ? 'bg-neon-blue border-neon-blue' : 'bg-white border-slate-300'
                                                }`}>
                                                {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                                            </div>
                                            {office.name}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-xs text-slate-500 mt-2">
                            * A hierarquia (Gerentes, Owners) será automaticamente vinculada com base nos escritórios selecionados.
                        </p>
                    </div>
                </div>

                {/* Upload Area */}
                <div className="p-8 bg-white rounded-xl border-2 border-dashed border-slate-300 hover:border-neon-pink transition-all group">
                    <input
                        type="file"
                        accept=".csv"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center justify-center min-h-[200px]">
                        {uploadFile ? (
                            <>
                                <FileUp className="w-16 h-16 text-neon-green mb-4" />
                                <span className="text-xl font-bold text-slate-900 mb-1">{uploadFile.name}</span>
                                <span className="text-sm text-slate-500">{(uploadFile.size / 1024).toFixed(1)} KB</span>
                            </>
                        ) : (
                            <>
                                <Upload className="w-16 h-16 text-slate-300 group-hover:text-neon-pink mb-4 transition-colors" />
                                <span className="text-lg font-medium text-slate-600 mb-2 group-hover:text-slate-900">
                                    Clique para selecionar o CSV
                                </span>
                                <span className="text-xs text-slate-400 uppercase tracking-widest">
                                    Layout Mapa Parque
                                </span>
                            </>
                        )}
                    </label>
                </div>

                {/* Status Messages */}
                {status && (
                    <div className={`p-4 rounded-lg flex items-center gap-3 ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {status.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="font-medium">{status.message}</span>
                    </div>
                )}

                {/* Action Button */}
                <button
                    onClick={handleUpload}
                    disabled={!uploadFile || isLoading || !campaignName.trim() || selectedOfficeIds.length === 0}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-neon-pink disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-neon-pink/20 uppercase tracking-wider flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processando Arquivo...
                        </>
                    ) : (
                        "Criar Campanha e Importar Leads"
                    )}
                </button>

                <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Layout Esperado</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                            "NR_CNPJ", "NM_CLIENTE", "TP_PRODUTO", "QT_MOVEL_TERM", "QT_BASICA_TERM_FIBRA",
                            "VERTICAL", "NM_CONTATO_SFA", "EMAIL_CONTATO_PRINCIPAL_SFA", "CELULAR_CONTATO_PRINCIPAL_SFA"
                        ].map(field => (
                            <span key={field} className="text-[10px] font-mono bg-white border border-slate-200 px-2 py-1 rounded text-slate-600">
                                {field}
                            </span>
                        ))}
                        <span className="text-[10px] text-slate-400 px-2 py-1 italic">...e demais campos</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
