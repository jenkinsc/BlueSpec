import { z } from 'zod';

const DEV_JWT_SECRET = 'emcomm-dev-secret-change-in-production';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),
  DATABASE_URL: z.string().default('file:emcomm.db'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  PORT: z.string().default('3000'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_PROVIDER: z.enum(['resend', 'none']).default('none'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEV_JWT_SECRET) {
    console.error(
      'FATAL: JWT_SECRET is set to the dev default in production. Set a strong secret and restart.',
    );
    process.exit(1);
  }

  return env;
}

export let env: Env;

export function initEnv(): void {
  env = validateEnv();
}
