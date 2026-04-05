import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load .env from project root (two levels up from apps/api/)
config({ path: '../../.env' });

export default defineConfig({
  schema: './dist/db/schema/*.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
