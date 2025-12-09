
import { PrismaClient, Role, Profile } from "@prisma/client";

const prisma = new PrismaClient();

async function checkHierarchy() {
    console.log("Checking hierarchy consistency...");
    const users = await prisma.user.findMany({
        include: {
            owner: true,
            officeRecord: true,
            managedOffices: true,
        },
    });

    const errors: string[] = [];

    for (const user of users) {
        // Check Role vs Profile consistency
        if (user.role !== (user.profile as unknown as Role)) {
            // Only warn if they are different concepts, but here they map 1:1 usually
            // console.warn(`User ${user.name} (${user.email}) has role ${user.role} and profile ${user.profile}`);
        }

        // Consultor checks
        if (user.role === Role.CONSULTOR) {
            if (!user.ownerId) {
                errors.push(`CONSULTOR ${user.name} (${user.email}) has NO Owner!`);
            } else if (!user.owner) {
                errors.push(`CONSULTOR ${user.name} (${user.email}) has invalid Owner ID: ${user.ownerId}`);
            } else if (user.owner.role !== Role.PROPRIETARIO) {
                errors.push(`CONSULTOR ${user.name} (${user.email}) is owned by ${user.owner.name} who is ${user.owner.role} (Expected PROPRIETARIO)`);
            }
        }

        // Proprietario checks
        if (user.role === Role.PROPRIETARIO) {
            if (!user.officeRecordId) {
                // Strict check: proprietario should belong to an office record
                errors.push(`PROPRIETARIO ${user.name} (${user.email}) has NO Office Record!`);
            }
        }

        // GN Checks
        if (user.role === Role.GERENTE_NEGOCIOS) {
            if (user.managedOffices.length === 0) {
                errors.push(`GN ${user.name} (${user.email}) manages NO offices!`);
            }
        }
    }

    if (errors.length > 0) {
        console.error("\nFOUND HIERARCHY ERRORS:");
        errors.forEach(e => console.error(`- ${e}`));
    } else {
        console.log("\nHierarchy looks clean!");
    }
}

checkHierarchy()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
