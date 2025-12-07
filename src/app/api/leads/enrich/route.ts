import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("id");
  const cnpjRaw = searchParams.get("cnpj");

  if (!leadId) return new NextResponse("Missing lead ID", { status: 400 });

  // Limpar CNPJ
  const cnpj = cnpjRaw?.replace(/\D/g, "");

  if (!cnpj) {
    return new NextResponse("CNPJ inválido ou não informado", { status: 400 });
  }

  try {
    // 1. Fetch data from BrasilAPI
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    if (!res.ok) {
      return new NextResponse(`Erro ao consultar BrasilAPI: ${res.statusText}`, { status: res.status });
    }

    const data = await res.json();

    // 2. Map fields to our needs
    const enrichedData = {
      razao_social: data.razao_social,
      nome_fantasia: data.nome_fantasia,
      cnpj: data.cnpj,
      cnae_fiscal_descricao: data.cnae_fiscal_descricao,
      capital_social: data.capital_social,
      qsa: data.qsa // Quadro de Sócios e Administradores
    };

    // 3. Update Lead
    // We merge with existing externalData if any, or overwrite
    // We also update core fields if they are empty

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        externalData: enrichedData,
        // Opcional: atualizar campos principais se estiverem vazios
        razaoSocial: lead?.razaoSocial ? undefined : data.razao_social,
        nomeFantasia: lead?.nomeFantasia ? undefined : data.nome_fantasia,
        cnae: lead?.cnae ? undefined : data.cnae_fiscal_descricao
      }
    });

    return NextResponse.json(enrichedData);
  } catch (error) {
    console.error("Enrichment error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
