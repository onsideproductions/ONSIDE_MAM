import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WASABI_ACCESS_KEY_ID: z.string().default(''),
  WASABI_SECRET_ACCESS_KEY: z.string().default(''),
  WASABI_REGION: z.string().default('eu-west-2'),
  WASABI_BUCKET: z.string().default('onside-mam'),
  WASABI_ENDPOINT: z.string().default('https://s3.eu-west-2.wasabisys.com'),
  GEMINI_API_KEY: z.string().default(''),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().default('http://localhost:3000'),
  API_PORT: z.coerce.number().default(3001),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function env(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:');
      console.error(result.error.flatten().fieldErrors);
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
