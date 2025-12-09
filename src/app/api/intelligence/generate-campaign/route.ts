import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, LeadStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        // Expanded roles: MASTER, GERENTE_SENIOR, GERENTE_NEGOCIOS, PROPRIETARIO
        const allowedRoles: string[] = [Role.MASTER, Role.GERENTE_SENIOR, Role.GERENTE_NEGOCIOS, Role.PROPRIETARIO];

        if (!session?.user || !allowedRoles.includes(session.user.role || "")) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { filters, tower, subTower, customName, officeId } = body;

        if (!tower) {
            return NextResponse.json({ message: "Torre é obrigatória" }, { status: 400 });
        }
        if (!officeId) {
            return NextResponse.json({ message: "Escritório é obrigatório" }, { status: 400 });
        }

        // Fetch Target Office to link Owner/Context
        const officeRecord = await prisma.officeRecord.findUnique({
            where: { id: officeId }
        });

        if (!officeRecord) {
            return NextResponse.json({ message: "Escritório inválido" }, { status: 400 });
        }

        // Permission Check for GN/Proprietario
        if (session.user.role === Role.PROPRIETARIO) {
            // Proprietario can only generate for their own office (ownedOffices is a relation, need to validade)
            // But session.user usually doesn't have deep relations. Let's fetch user.
            const userCheck = await prisma.user.findUnique({
                where: { id: session.user.id },
                include: { ownedOffices: true }
            });
            const isOwner = userCheck?.ownedOffices.some(o => o.id === officeId) || userCheck?.officeRecordId === officeId;
            if (!isOwner) {
                return NextResponse.json({ message: "Permissão negada: Você não é proprietário deste escritório." }, { status: 403 });
            }
        }

        if (session.user.role === Role.GERENTE_NEGOCIOS) {
            const userCheck = await prisma.user.findUnique({
                where: { id: session.user.id },
                include: { managedOffices: true } // managedOffices is ManagerOffice[], so we check officeRecordId
            });
            const isManager = userCheck?.managedOffices.some(mo => mo.officeRecordId === officeId);
            if (!isManager) {
                return NextResponse.json({ message: "Permissão negada: Você não gerencia este escritório." }, { status: 403 });
            }
        }

        // 1. Build Query from Filters
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};

        // Example Filter Logic (Expand based on UI)
        if (filters?.vertical) where.vertical = filters.vertical;
        if (filters?.cidade) where.cidade = { contains: filters.cidade, mode: 'insensitive' };
        if (filters?.uf) where.uf = filters.uf;

        // Product Logic (Ranges)
        if (filters?.productRules && Array.isArray(filters.productRules)) {
            // [{ field: 'qtMovelTerm', operator: 'gt', value: 0 }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filters.productRules.forEach((rule: any) => {
                if (rule.value !== undefined && rule.field) {
                    if (!where[rule.field]) where[rule.field] = {};
                    where[rule.field][rule.operator] = Number(rule.value);
                }
            });
        }

        // Hierarchy filters
        if (filters?.officeName) where.officeName = filters.officeName;
        if (filters?.loginConsultor) where.loginConsultor = filters.loginConsultor;

        // Flag Logic (Strings "1"/"0")
        if (filters?.flgCobertura) where.flgCobertura = { contains: "1" };


        // 2. Fetch Intelligence Data
        const targets = await prisma.intelligenceData.findMany({
            where,
            take: 5000 // Limit for safety in V1, maybe paginated later
        });

        if (targets.length === 0) {
            return NextResponse.json({ message: "Nenhum cliente encontrado com estes filtros." }, { status: 404 });
        }

        // 3. Create Campaign
        const campaignName = `[${tower}] ${subTower ? `- ${subTower}` : ""} ${customName ? `- ${customName}` : ""} - ${new Date().toLocaleDateString('pt-BR')}`;
        const campaignDesc = `Campanha gerada via Inteligência de Mercado.\nTorre: ${tower}\nSub-torre: ${subTower || "N/A"}\nFiltros originais: ${JSON.stringify(filters)}`;

        const campanha = await prisma.campanha.create({
            data: {
                nome: campaignName,
                descricao: campaignDesc,
                objetivo: tower, // Storing "Tower" in "Objetivo" field
                createdById: session.user.id,
                ownerId: officeRecord.ownerId, // Link to Office Owner
                office: officeRecord.office,   // Link to Office Enum
                totalLeads: targets.length,
                remainingLeads: targets.length,
                status: "ATIVA",
                isActive: true
            }
        });

        // 4. Resolve Consultants (Performance Optimization: Bulk fetch users)
        // We need to map 'loginConsultor' (from excel) to User.id
        // Assuming 'loginConsultor' in Excel matches User.email or User.name or a custom code.
        // Let's assume matches Email for now or Name? Login usually implies username/email.
        // Let's fetch all active consultants to map.

        const consultants = await prisma.user.findMany({
            where: { role: Role.CONSULTOR, active: true },
            select: { id: true, email: true, name: true, ownerId: true, seniorId: true } // Fetch hierarchy too
        });

        // Simple Fuzzy/Direct Matcher
        const findConsultant = (login: string | null) => {
            if (!login) return null;
            const lower = login.toLowerCase();
            return consultants.find(c =>
                c.email.toLowerCase() === lower ||
                c.name.toLowerCase() === lower ||
                c.email.split('@')[0].toLowerCase() === lower // Match username part of email
            );
        };

        // 5. Prepare Leads
        const leads = targets.map(target => {
            const assignedConsultant = findConsultant(target.loginConsultor);

            return {
                campanhaId: campanha.id,
                cnpj: target.cnpj,
                razaoSocial: target.razaoSocial || "Cliente Desconhecido",
                nomeFantasia: target.nomeFantasia,
                endereco: target.endereco,
                numero: target.numero,
                cep: target.cep,
                bairro: target.bairro,
                cidade: target.cidade,
                estado: target.uf,
                vertical: target.vertical,

                // Hierarchy assignment
                consultorId: assignedConsultant?.id || null,
                ownerId: assignedConsultant?.ownerId || null,
                // If we implemented gnId/gsId on Lead, we would map it here implies from Consultant's hierarchy

                status: "NOVO" as LeadStatus,

                // Rich Data in externalData or Observacoes
                observacoesGerais: `Dados Inteligência:\nVertical: ${target.vertical}\nProdutos: Móvel(${target.qtMovelTerm}), Fibra(${target.qtBasicaFibra})`,
                externalData: target as unknown as Prisma.InputJsonValue
            };
        });

        // Bulk Insert
        await prisma.lead.createMany({
            data: leads
        });

        return NextResponse.json({
            success: true,
            campaignId: campanha.id,
            leadsCreated: leads.length,
            message: `Campanha criada com ${leads.length} leads.`
        });

    } catch (error) {
        console.error("Error generating campaign:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
