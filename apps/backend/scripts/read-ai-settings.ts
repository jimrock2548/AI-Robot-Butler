// Read settings in a fresh process to verify durable PostgreSQL storage without restarting hardware services.
export {};
process.env.DB_MODE = 'pg';
const { initializeAiSettings, readAiSettings } = await import('../src/services/aiSettings');
const { prisma } = await import('../src/db/postgres');
try { await initializeAiSettings(); console.log(JSON.stringify(readAiSettings())); }
finally { await prisma.$disconnect(); }
