"use client";

import { useState } from "react";
import { OfficesTab } from "./OfficesTab";
import { UsersTab } from "./UsersTab";
import * as Tabs from "@radix-ui/react-tabs";

export default function AcessosPage() {
    const [activeTab, setActiveTab] = useState("usuarios");

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <header className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-neon-blue font-bold">Administração</p>
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Acessos e Escritórios</h1>
                <p className="text-slate-400 text-sm">Gerencie usuários, hierarquias e escritórios da plataforma.</p>
            </header>

            <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-6">
                <Tabs.List className="flex border-b border-pic-zinc">
                    <Tabs.Trigger
                        value="usuarios"
                        className={`px-6 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === "usuarios"
                                ? "border-neon-blue text-white"
                                : "border-transparent text-slate-500 hover:text-slate-300"
                            }`}
                    >
                        Usuários
                    </Tabs.Trigger>
                    <Tabs.Trigger
                        value="escritorios"
                        className={`px-6 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === "escritorios"
                                ? "border-neon-green text-white"
                                : "border-transparent text-slate-500 hover:text-slate-300"
                            }`}
                    >
                        Escritórios
                    </Tabs.Trigger>
                </Tabs.List>

                <Tabs.Content value="usuarios" className="outline-none focus:outline-none">
                    <UsersTab />
                </Tabs.Content>

                <Tabs.Content value="escritorios" className="outline-none focus:outline-none">
                    <OfficesTab />
                </Tabs.Content>
            </Tabs.Root>
        </div>
    );
}
