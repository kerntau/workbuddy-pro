import type {UsagePoint} from './types';

/** Null means unavailable; an empty successful response really has zero usage. */
export function summarizeUsage(points: readonly UsagePoint[] | undefined) {
  if (!points) return null;
  return points.reduce((total, point) => ({
    requests: total.requests + point.requests,
    input: total.input + point.prompt_tokens,
    output: total.output + point.completion_tokens,
    tokens: total.tokens + point.prompt_tokens + point.completion_tokens,
    credit: total.credit + point.credit,
    failed: total.failed + (point.failed ?? 0),
  }), {requests: 0, input: 0, output: 0, tokens: 0, credit: 0, failed: 0});
}
