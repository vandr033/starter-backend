import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  db: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    url: process.env.DATABASE_URL!
  }
};

if (!env.db.host || !env.db.user || !env.db.database) {
  throw new Error('Missing DB env vars');
}