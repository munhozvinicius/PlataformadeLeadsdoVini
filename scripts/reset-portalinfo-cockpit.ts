// @ts-nocheck
// Limpa campanhas Cockpit existentes e recria a base Portalinfo do zero.
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient, CampaignType, LeadStatus, Office } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_OFFICE = Office.SAFE_TI;
const PORTALINFO_MAX_BYTES = 10 * 1024 * 1024;

type PortalinfoRow = {
  UF: string;
  CIDADE: string;
  DOCUMENTO: string;
  EMPRESA: string;
  CD_CNAE: string;
  VL_FAT_PRESUMIDO: string;
  TELEFONE1?: string;
  TELEFONE2?: string;
  TELEFONE3?: string;
  LOGRADOURO: string;
  TERRITORIO: string;
  OFERTA_MKT: string;
  CEP: string;
  NUMERO: string;
  ESTRATEGIA: string;
  ARMARIO: string;
  ID_PRUMA: string;
  VERTICAL: string;
};

const PORTALINFO_SAMPLE_BASE: PortalinfoRow[] = [
  {
    UF: "SP",
    CIDADE: "RIBEIRAO PRETO",
    DOCUMENTO: "3278377000103",
    EMPRESA: "A. A. DOS SANTOS INDUSTRIA METALURGICA",
    CD_CNAE: "2599302",
    VL_FAT_PRESUMIDO: "R$ 110,000,00",
    TELEFONE1: "",
    TELEFONE2: "",
    TELEFONE3: "",
    LOGRADOURO: "JARDINOPOLIS, 1105, ND",
    TERRITORIO: "RIBEIRAO PRETO",
    OFERTA_MKT: "REGIONAL",
    CEP: "14075560",
    NUMERO: "1105",
    ESTRATEGIA: "ADESAO AVANCADOS",
    ARMARIO: "11529NR",
    ID_PRUMA: "0",
    VERTICAL: "INDUSTRIA",
  },
  {
    UF: "SP",
    CIDADE: "RIBEIRAO PRETO",
    DOCUMENTO: "21399532000113",
    EMPRESA: "A. M. DE OLIVEIRA MANUTENCAO",
    CD_CNAE: "3321000",
    VL_FAT_PRESUMIDO: "R$ 110,000,00",
    TELEFONE1: "16982336462",
    TELEFONE2: "16981625912",
    TELEFONE3: "16997599615",
    LOGRADOURO: "SILVIO AUGUSTO FACCIO, 342, ND",
    TERRITORIO: "RIBEIRAO PRETO",
    OFERTA_MKT: "REGIONAL",
    CEP: "14030640",
    NUMERO: "342",
    ESTRATEGIA: "ADESAO AVANCADOS",
    ARMARIO: "11529SO",
    ID_PRUMA: "0",
    VERTICAL: "INDUSTRIA",
  },
];

function clean(value?: string) {
  const trimmed = value?.toString().trim();
  return trimmed ? trimmed : null;
}

function buildLead(row: PortalinfoRow, campanhaId: string) {
  const telefones = [row.TELEFONE1, row.TELEFONE2, row.TELEFONE3].filter(Boolean) as string[];
  const fatPresumido = row.VL_FAT_PRESUMIDO ? row.VL_FAT_PRESUMIDO.replace(/[^0-9,.-]/g, "") : null;
  return {
    campanhaId,
    type: CampaignType.COCKPIT,
    status: LeadStatus.NOVO,
    isWorked: false,
    UF: clean(row.UF),
    CIDADE: clean(row.CIDADE),
    DOCUMENTO: clean(row.DOCUMENTO),
    EMPRESA: clean(row.EMPRESA),
    CD_CNAE: clean(row.CD_CNAE),
    VL_FAT_PRESUMIDO: fatPresumido,
    TELEFONE1: telefones[0] ?? null,
    TELEFONE2: telefones[1] ?? null,
    TELEFONE3: telefones[2] ?? null,
    LOGRADOURO: clean(row.LOGRADOURO),
    TERRITORIO: clean(row.TERRITORIO),
    OFERTA_MKT: clean(row.OFERTA_MKT),
    CEP: clean(row.CEP),
    NUMERO: clean(row.NUMERO),
    ESTRATEGIA: clean(row.ESTRATEGIA),
    ARMARIO: clean(row.ARMARIO),
    ID_PRUMA: clean(row.ID_PRUMA),
    VERTICAL_COCKPIT: clean(row.VERTICAL),
    razaoSocial: clean(row.EMPRESA),
    nomeFantasia: clean(row.EMPRESA),
    cidade: clean(row.CIDADE),
    estado: clean(row.UF),
    telefone: telefones[0] ?? null,
    telefone1: telefones[0] ?? null,
    telefone2: telefones[1] ?? null,
    telefone3: telefones[2] ?? null,
    telefones: telefones.length ? telefones : undefined,
    raw: row,
  };
}

async function purgeCockpitCampaigns() {
  const campaigns = await prisma.campanha.findMany({
    where: {
      OR: [
        { type: CampaignType.COCKPIT },
        { tipo: CampaignType.COCKPIT },
        { nome: { contains: "cockpit", mode: "insensitive" } },
      ],
    },
    select: { id: true, nome: true },
  });

  if (campaigns.length === 0) {
    console.log("Nenhuma campanha Cockpit encontrada para remover.");
    return [];
  }

  const campaignIds = campaigns.map((c) => c.id);
  console.log(`Removendo ${campaignIds.length} campanha(s) Cockpit: ${campaigns.map((c) => c.nome).join(", ")}`);

  const leadIds = (
    await prisma.lead.findMany({
      where: { campanhaId: { in: campaignIds } },
      select: { id: true },
    })
  ).map((lead) => lead.id);

  if (leadIds.length > 0) {
    console.log(`Apagando ${leadIds.length} lead(s) associados.`);
  }

  await prisma.$transaction([
    prisma.leadHistory.deleteMany({ where: { leadId: { in: leadIds } } }),
    prisma.leadActivity.deleteMany({ where: { campaignId: { in: campaignIds } } }),
    prisma.distributionLog.deleteMany({ where: { campaignId: { in: campaignIds } } }),
    prisma.lead.deleteMany({ where: { id: { in: leadIds } } }),
    prisma.importBatch.deleteMany({ where: { campaignId: { in: campaignIds } } }),
    prisma.campanha.deleteMany({ where: { id: { in: campaignIds } } }),
  ]);

  console.log("Campanhas Cockpit e dependencias excluidas.");
  return campaignIds;
}

async function createPortalinfoCampaign() {
  console.log("Criando campanha Portalinfo Cockpit...");
  const campanha = await prisma.campanha.create({
    data: {
      nome: "Portalinfo Cockpit",
      descricao: "Campanha recriada com base Portalinfo (limite 10MB).",
      type: CampaignType.COCKPIT,
      tipo: CampaignType.COCKPIT,
      office: TARGET_OFFICE,
      totalLeads: 0,
      remainingLeads: 0,
    },
  });

  if (PORTALINFO_SAMPLE_BASE.length === 0) {
    console.log(`Campanha criada sem leads (id: ${campanha.id}).`);
    return campanha;
  }

  if (JSON.stringify(PORTALINFO_SAMPLE_BASE).length > PORTALINFO_MAX_BYTES) {
    throw new Error("A base Portalinfo embutida ultrapassa 10MB, ajuste os dados.");
  }

  const leads = PORTALINFO_SAMPLE_BASE.map((row) => buildLead(row, campanha.id));
  await prisma.lead.createMany({ data: leads });
  await prisma.campanha.update({
    where: { id: campanha.id },
    data: {
      totalLeads: leads.length,
      remainingLeads: leads.length,
    },
  });
  console.log(`Campanha criada com ${leads.length} lead(s).`);
  return campanha;
}

async function main() {
  await purgeCockpitCampaigns();
  await createPortalinfoCampaign();
}

main()
  .catch((error) => {
    console.error("Erro ao reiniciar campanha Portalinfo Cockpit:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
