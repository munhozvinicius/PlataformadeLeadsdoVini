import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function getPrismaClient() {
  const datasourceUrl =
    process.env.MONGO_URL_MONGODB_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;

  const client = new PrismaClient({
    datasources: {
      db: {
        // Fallback evita falha em build sem variável; em produção a env deve estar definida.
        url: datasourceUrl || "mongodb://127.0.0.1:27017/placeholder",
      },
    },
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
  });
  return client;
}

export const prisma = global.prisma || getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
