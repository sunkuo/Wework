import pkg from '@prisma/client';
const { PrismaClient } = pkg;

export const prisma = new PrismaClient();

export async function checkConnection() {
  try {
    await prisma.$connect();
    return true;
  } catch (e) {
    console.error("Database connection failed:", e);
    throw e;
  }
}

export async function checkTables() {
  try {
    await prisma.session.count();
    return true;
  } catch (e) {
    throw new Error("Database schema check failed: " + e.message);
  }
}
