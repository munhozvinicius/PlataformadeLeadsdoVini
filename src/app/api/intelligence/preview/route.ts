
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user || (session.user.role !== "MASTER" && session.user.role !== "GERENTE_SENIOR")) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { filters, page = 1, pageSize = 20 } = body;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = {};

        // 1. Basic Text Filters
        if (filters.cidade) {
            where.cidade = { contains: filters.cidade, mode: "insensitive" };
        }
        if (filters.vertical) {
            where.vertical = { contains: filters.vertical, mode: "insensitive" };
        }
        if (filters.officeName) {
            where.officeName = { contains: filters.officeName, mode: "insensitive" };
        }
        if (filters.cnpj) {
            where.cnpj = { contains: filters.cnpj };
        }

        // 2. Flags
        if (filters.flgCobertura) {
            // Assuming '1' or 'SIM' or 'S' based on typical data imports. 
            // We'll check for '1' as seen in the UI hint
            where.flgCobertura = { contains: "1" };
        }

        // 3. Product Rules (Numeric)
        // filters.productRules = [{ field: 'qtMovelTerm', operator: 'gt', value: 0 }]
        if (Array.isArray(filters.productRules) && filters.productRules.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filters.productRules.forEach((rule: any) => {
                if (rule.field && rule.operator && rule.value !== undefined) {
                    const numVal = Number(rule.value);
                    if (!isNaN(numVal)) {
                        if (!where[rule.field]) {
                            where[rule.field] = {};
                        }
                        where[rule.field][rule.operator] = numVal;
                    }
                }
            });
        }

        // Count Total
        const totalCount = await prisma.intelligenceData.count({ where });

        // Get Page
        const items = await prisma.intelligenceData.findMany({
            where,
            take: pageSize,
            skip: (page - 1) * pageSize,
            orderBy: { razaoSocial: "asc" }
        });

        return NextResponse.json({
            count: totalCount,
            items
        });

    } catch (error) {
        console.error("Error previewing intelligence data:", error);
        return NextResponse.json({ message: "Error processing request" }, { status: 500 });
    }
}
