export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

const ALLOWED: Role[] = [Role.MASTER, Role.GERENTE_SENIOR];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.role || !ALLOWED.includes(session.user.role as Role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const leads = await prisma.lead.findMany({
    select: {
      id: true,
      DOCUMENTO: true,
      documento: true,
      cnpj: true,
      NR_CNPJ: true,
      EMPRESA: true,
      razaoSocial: true,
      nomeFantasia: true,
      vertical: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      telefones: true,
      campanha: { select: { id: true, nome: true } },
      consultor: { select: { id: true, name: true, email: true } },
    },
  });

  const map = new Map<
    string,
    {
      key: string;
      documento: string | null;
      nome: string;
      vertical: string | null;
      campanhas: { id: string; nome: string }[];
      consultores: { id: string; name?: string | null; email?: string | null }[];
      leads: Array<{ id: string; campanha?: { id: string; nome: string } | null; status: string; updatedAt: Date | null }>;
      likes: number;
      dislikes: number;
      lastUpdate: Date | null;
    }
  >();

  for (const lead of leads) {
    const documento =
      lead.NR_CNPJ ||
      lead.cnpj ||
      lead.DOCUMENTO ||
      lead.documento ||
      null;
    const nome = lead.razaoSocial || lead.nomeFantasia || lead.EMPRESA || "Sem nome";
    const key = documento || nome;
    const existing = map.get(key);
    const base = existing ?? {
      key,
      documento,
      nome,
      vertical: lead.vertical ?? null,
      campanhas: [],
      consultores: [],
      leads: [],
      likes: 0,
      dislikes: 0,
      lastUpdate: null as Date | null,
    };

    if (lead.campanha) {
      if (!base.campanhas.some((c) => c.id === lead.campanha!.id)) {
        base.campanhas.push(lead.campanha);
      }
    }
    if (lead.consultor) {
      if (!base.consultores.some((c) => c.id === lead.consultor!.id)) {
        base.consultores.push(lead.consultor);
      }
    }
    base.leads.push({ id: lead.id, campanha: lead.campanha, status: lead.status, updatedAt: lead.updatedAt });

    if (Array.isArray(lead.telefones)) {
      for (const t of lead.telefones as unknown[]) {
        const tel = t as { feedback?: string | null };
        if (tel.feedback === "like") base.likes += 1;
        if (tel.feedback === "dislike") base.dislikes += 1;
      }
    }

    if (!base.lastUpdate || (lead.updatedAt && lead.updatedAt > base.lastUpdate)) {
      base.lastUpdate = lead.updatedAt;
    }

    map.set(key, base);
  }

  const result = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  return NextResponse.json(result);
}
