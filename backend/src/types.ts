import { z } from 'zod';

const moneyItem = z.object({ id: z.string(), title: z.string(), amount: z.number().finite(), date: z.string(), category: z.string(), necessity: z.string().optional(), projectId: z.string().optional() }).strict();
export const snapshotSchema = z.object({
  schemaVersion: z.literal('alexander-ai-snapshot/v1'),
  sourceVersion: z.string(), capturedAt: z.string().datetime(),
  goals: z.array(z.object({ id:z.string(), title:z.string(), current:z.number(), target:z.number(), deadline:z.string(), unit:z.string(), nextAction:z.string() }).strict()).max(100),
  projects: z.array(z.object({ id:z.string(), name:z.string(), status:z.string(), expectedValue:z.number(), nextAction:z.string(), adMetrics:z.record(z.string(),z.number()).optional() }).strict()).max(100),
  tasks: z.array(z.object({ id:z.string(), title:z.string(), projectId:z.string(), priority:z.string(), due:z.string(), status:z.string() }).strict()).max(1000),
  finances: z.object({ accounts: z.array(z.object({ id:z.string(), purpose:z.string(), balance:z.number() }).strict()).max(50), transactions:z.array(moneyItem).max(2000), obligations:z.array(z.object({ id:z.string(), title:z.string(), amount:z.number(), dueDate:z.string(), status:z.string() }).strict()).max(200), monthlyIncomeTarget:z.number(), monthlyExpenseLimit:z.number(), cushionTarget:z.number() }).strict(),
  aiNotes: z.array(z.object({ id:z.string(), title:z.string(), body:z.string(), updatedAt:z.string() }).strict()).max(200)
}).strict();
export type AiSnapshot = z.infer<typeof snapshotSchema>;
