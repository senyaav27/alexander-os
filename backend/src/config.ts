import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().regex(/^\d+$/).optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  AI_SYNC_TOKEN: z.string().min(24),
  DAILY_BRIEF_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  TIMEZONE: z.string().default('Europe/Moscow')
});

export type Config = z.infer<typeof schema>;
export const config = schema.parse(process.env);

