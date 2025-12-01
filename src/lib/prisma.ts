import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function getPrismaClient() {
  const datasourceUrl =
    process.env.MONGO_URL_MONGODB_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!datasourceUrl) {
    throw new Error("Missing Mongo connection string (MONGO_URL_MONGODB_URI or MONGODB_URI).");
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
  });
  return client;
}

export const prisma = global.prisma || getPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
