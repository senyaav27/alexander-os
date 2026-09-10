import test from 'node:test'; import assert from 'node:assert/strict';
import { snapshotSchema } from '../src/types.js'; import { redact } from '../src/redact.js'; import { fixture } from './analysis.test.js';
test('allowlist rejects an unexpected secret field',()=>{assert.equal(snapshotSchema.safeParse({...fixture,pin:'1234'}).success,false);});
test('logs redact credentials and card-like values',()=>{assert.deepEqual(redact({apiKey:'sk-secret-secret-secret',nested:{cardNumber:'4111111111111111'},ok:'safe'}),{nested:{},ok:'safe'});});

