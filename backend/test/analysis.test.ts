import test from 'node:test'; import assert from 'node:assert/strict';
import { dailyBrief, financeAnalysis, projectAnalysis } from '../src/analysis.js';
import type { AiSnapshot } from '../src/types.js';
import { fixture } from './fixture.js';

test('finance is deterministic and excludes cushion from free cash',()=>{assert.deepEqual(financeAnalysis(fixture,new Date('2026-09-10T12:00:00Z')),{income:80000,expenses:20000,openObligations:15000,availableCash:35000,budgetVariance:50000,incomeGap:120000,overBudget:false});});
test('projects expose missing next action bottleneck',()=>{assert.equal(projectAnalysis(fixture)[0]?.bottleneck,'Нет следующего действия');});
test('daily brief uses actual snapshot values',()=>{const brief=dailyBrief(fixture,new Date('2026-09-10T12:00:00Z'));assert.match(brief,/120\s000 ₽/);assert.match(brief,/RIFT/);});

