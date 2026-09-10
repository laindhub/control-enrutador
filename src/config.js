import 'dotenv/config';

const requiredProductionVariables = [
  'SESSION_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'ROUTER_USERNAME',
  'ROUTER_PASSWORD',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
];

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  timezone: process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires',
  sessionSecret: process.env.SESSION_SECRET || 'development-only-change-me',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'control_enrutador',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  },
  bootstrap: {
    routerUsername: process.env.ROUTER_USERNAME,
    routerPassword: process.env.ROUTER_PASSWORD,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    advisorUsername: process.env.ADVISOR_USERNAME,
    advisorPassword: process.env.ADVISOR_PASSWORD,
    demoUsername: process.env.DEMO_USERNAME,
    demoPassword: process.env.DEMO_PASSWORD,
    aiDemoUsername: process.env.AI_DEMO_USERNAME,
    aiDemoPassword: process.env.AI_DEMO_PASSWORD,
  },
  alphaProductionEnabled: process.env.ALPHA_PRODUCTION_ENABLED === 'true',
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
  },
};

export function validateConfig() {
  if (config.env !== 'production') return;
  const missing = requiredProductionVariables.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}`);
  }
  if (config.sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET debe contener al menos 32 caracteres.');
  }
  if ((config.bootstrap.routerPassword || '').length < 8) {
    throw new Error('ROUTER_PASSWORD debe contener al menos 8 caracteres.');
  }
  if ((config.bootstrap.adminPassword || '').length < 12) {
    throw new Error('ADMIN_PASSWORD debe contener al menos 12 caracteres.');
  }
}
