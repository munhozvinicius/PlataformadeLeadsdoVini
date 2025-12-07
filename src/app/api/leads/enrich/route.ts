import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { fetchCompanyData } from "@/services/enrichment";

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
    // 1. Fetch data using our robust service
    const enrichedData = await fetchCompanyData(cnpj);

    if (!enrichedData) {
      return new NextResponse("Não foi possível obter dados de nenhuma fonte externa.", { status: 404 });
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    // 2. Update Lead
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        externalData: enrichedData as any, // Json type in Prisma
        // Update core fields if empty
        razaoSocial: lead?.razaoSocial ? undefined : enrichedData.razao_social,
        nomeFantasia: lead?.nomeFantasia ? undefined : enrichedData.nome_fantasia,
        cnae: lead?.cnae ? undefined : enrichedData.cnae_fiscal_descricao,
        // Also update address if available and empty
        logradouro: lead?.logradouro ? undefined : enrichedData.logradouro,
        numero: lead?.numero ? undefined : enrichedData.numero,
        cidade: lead?.cidade ? undefined : enrichedData.municipio,
        estado: lead?.estado ? undefined : enrichedData.uf,
      }
    });

    return NextResponse.json(enrichedData);
  } catch (error) {
    console.error("Enrichment error:", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
