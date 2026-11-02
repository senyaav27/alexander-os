import { z } from 'zod';

const text = () => z.string().max(4000);
const amount = () => z.number().finite().min(-1e9).max(1e9);
const moneyItem = z.object({ id: text(), title: text(), amount: amount().finite(), date: text().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v), category: text().refine(v => !/health|security|private/i.test(v)), necessity: text().optional(), projectId: text().optional() }).strict();
export const snapshotSchema = z.object({
  schemaVersion: z.literal('alexander-ai-snapshot/v1'),
  sourceVersion: text(), capturedAt: text().datetime(),
  goals: z.array(z.object({ id:text(), title:text(), current:amount(), target:amount(), deadline:text(), unit:text(), nextAction:text() }).strict()).max(100),
  projects: z.array(z.object({ id:text(), name:text(), status:text(), expectedValue:amount(), nextAction:text(), adMetrics:z.partialRecord(z.enum(['spend','budget','impressions','clicks','cpm','cpc','leads','registrations','trials','purchases','cpa','cac','revenue','roas']),amount().nonnegative()).optional() }).strict()).max(100),
  tasks: z.array(z.object({ id:text(), title:text(), projectId:text(), priority:text(), due:text(), status:text() }).strict()).max(1000),
  finances: z.object({ accounts: z.array(z.object({ id:text(), purpose:z.enum(['general','cushion','investment']), balance:amount() }).strict()).max(50), transactions:z.array(moneyItem).max(2000), obligations:z.array(z.object({ id:text(), title:text(), amount:amount(), dueDate:text(), status:z.enum(['open','paid','received']), type:z.enum(['payment','debt','expected']) }).strict()).max(200), monthlyIncomeTarget:amount(), monthlyExpenseLimit:amount(), cushionTarget:amount(), targetMonth:text().regex(/^\d{4}-\d{2}$/).optional() }).strict(),
  aiNotes: z.array(z.object({ id:text(), title:text(), body:text(), updatedAt:text() }).strict()).max(200)
}).strict();
export type AiSnapshot = z.infer<typeof snapshotSchema>;
