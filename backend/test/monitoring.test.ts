import test from 'node:test'; import assert from 'node:assert/strict';
import { evaluateRule, parseMonitoringRule } from '../src/monitoring.js'; import { fixture } from './analysis.test.js';
test('CPA threshold triggers alert from a new snapshot',()=>{const alert=evaluateRule(fixture,{id:'r1',project_name:'RIFT',metric:'cpa',operator:'gt',threshold:700});assert.equal(alert?.value,750);assert.match(alert?.message,/RIFT/);});
test('non-trigger stays quiet',()=>{assert.equal(evaluateRule(fixture,{id:'r2',project_name:'RIFT',metric:'cpa',operator:'gt',threshold:900}),null);});
test('natural-language rule is parsed into bounded fields',()=>{assert.deepEqual(parseMonitoringRule('Следи за CPA проекта RIFT если выше 700 рублей'),{metric:'cpa',projectName:'RIFT',operator:'gt',threshold:700});});

