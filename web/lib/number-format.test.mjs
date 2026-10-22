import assert from 'node:assert/strict';
import {compactNumber, creditNumber} from './number-format.ts';
import {summarizeUsage} from './usage-display.ts';

for (const [value, expected] of [
  [0, '0'], [999, '999'], [1000, '1K'], [1234, '1.23K'],
  [999999, '1M'], [1234567, '1.23M'], [999999999, '1B'],
  [1000000000, '1B'], [1234567890, '1.23B'],
  [999999999999, '1T'], [1234567890123, '1.23T'],
  [-1234567890, '-1.23B'], [null, '—'], [undefined, '—'], [NaN, '—'],
]) assert.equal(compactNumber(value), expected, `compact ${value}`);

assert.equal(creditNumber(128.37, 'en-US'), '128.37');
assert.equal(creditNumber(1256.789, 'en-US'), '1,256.79');
assert.equal(creditNumber(0.00004, 'en-US'), '0.00004');
assert.equal(creditNumber(0.000000001, 'en-US'), '<0.00000001');
assert.equal(creditNumber(0, 'en-US'), '0');
assert.equal(creditNumber(null, 'en-US'), '—');
assert.equal(creditNumber(128.37, 'de-DE'), '128,37');

// A failed fetch is unavailable, not an empty successful period.
assert.equal(summarizeUsage(undefined), null);
assert.deepEqual(summarizeUsage([]), {
  requests: 0, input: 0, output: 0, tokens: 0, credit: 0, failed: 0,
});
const points = [
  {day: '2026-10-21', requests: 9, prompt_tokens: 800000000, completion_tokens: 100000000, credit: 128.37, failed: 3},
  {day: '2026-10-22', requests: 2, prompt_tokens: 200000000, completion_tokens: 50000000, credit: 0.00004, failed: 5},
];
const range = summarizeUsage(points);
assert.equal(range.tokens, 1150000000);
assert.equal(range.requests, 11); // Failures remain separate from metered requests.
assert.equal(range.failed, 8);
assert.equal(range.input + range.output, range.tokens);
assert.ok(Math.abs(range.credit - 128.37004) < 1e-9);
assert.equal(summarizeUsage(points.slice(-1)).tokens, 250000000);
console.log('number formats and period summaries: all passed');
