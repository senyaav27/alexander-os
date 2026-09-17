import 'dotenv/config';
import { z } from 'zod';
const optional = <T extends z.ZodType>(s: T) => z.preprocess(v => v === '' ? undefined : v, s.optional());
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(['true', 'false', 'render-internal']).default('false'),
  OPENAI_API_KEY: optional(z.string().min(1)),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  TELEGRAM_BOT_TOKEN: optional(z.string().min(1)),
  TELEGRAM_ALLOWED_USER_ID: optional(z.string().regex(/^[1-9]\d{0,15}$/)),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string().regex(/^[A-Za-z0-9_-]{24,256}$/)),
  PUBLIC_BASE_URL: optional(z.string().url().startsWith('https://')),
  AI_SYNC_TOKEN: z.string().min(24).refine(v => !/replace|example/i.test(v), 'Generate a random sync token'),
  DAILY_BRIEF_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  TIMEZONE: z.string().default('Europe/Moscow').refine(v => { try { new Intl.DateTimeFormat('en', {timeZone:v}); return true; } catch { return false; } }),
  OPENAI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(0).max(100).default(20)
}).superRefine((c,ctx)=>{
  if(c.TELEGRAM_BOT_TOKEN && (!c.TELEGRAM_ALLOWED_USER_ID || !c.TELEGRAM_WEBHOOK_SECRET)) ctx.addIssue({code:'custom',message:'Telegram requires allowed user ID and webhook secret'});
});
export const config = configSchema.parse(process.env);
export type Config = typeof config;
