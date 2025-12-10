export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CampaignType } from "@prisma/client";

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        // 1. Validate Session
        if (!session?.user) {
            return NextResponse.json({ message: "Unauthorized (no session)" }, { status: 401 });
        }

        // 2. Validate Role Permissions for Creation
        const allowedRolesForCreate = ["MASTER", "GERENTE_SENIOR", "GERENTE_NEGOCIOS", "PROPRIETARIO"];
        if (!allowedRolesForCreate.includes(session.user.role)) {
            return NextResponse.json({ message: "Sem permissão para criar campanha." }, { status: 403 });
        }

        const body = await req.json();
        const { nome, descricao, type, office } = body;

        // 3. Basic Validation
        if (!nome || !type || !office) {
            return NextResponse.json({ message: "Nome, tipo e escritório são obrigatórios." }, { status: 400 });
        }

        // 4. Validate Office Restriction (GN & Proprietário can only create for their own office)
        const isRestrictedRole = ["GERENTE_NEGOCIOS", "PROPRIETARIO"].includes(session.user.role);

        // Assuming session.user.office is the reference enum or value. 
        // Need to ensure type compatibility. If session.user.office is enum, comparison is straight.
        if (isRestrictedRole && session.user.office !== office) {
            return NextResponse.json({ message: "Você só pode criar campanha para o seu escritório." }, { status: 403 });
        }

        // 5. Create Campaign
        const campagneTypeEnum = type === "MAPA_PARQUE" ? CampaignType.MAPA_PARQUE : CampaignType.COCKPIT;

        const campanha = await prisma.campanha.create({
            data: {
                nome,
                descricao,
                type: campagneTypeEnum, // using new field 'type' mapping to enum
                tipo: campagneTypeEnum, // keeping legacy field in sync
                office,
                createdById: session.user.id,
                // officeRecords connection logic if needed elsewhere, strictly following 'office' enum usage for now as requested
            },
        });

        return NextResponse.json(campanha, { status: 201 });

    } catch (error) {
        console.error("Error creating campaign:", error);
        return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
    }
}
