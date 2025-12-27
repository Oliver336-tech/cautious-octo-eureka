import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  adminEmail: process.env.ADMIN_EMAIL || '',
  dbPath: process.env.DB_PATH || './data/fcba.sqlite',
  seed: process.env.SIMULATION_SEED || 'ascension-online'
};
