import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, type Problem } from '../api/problem';
import { problemMsg } from './problem';

const rateLimited = { type: 'urn:narudzbine:problem:rate_limited', title: 'Too many requests', status: 429, code: 'RATE_LIMITED' } as Problem;

test('a rate limit says how long to wait when Retry-After is known (QA-027)', () => {
  assert.deepEqual(problemMsg(new ApiError(429, rateLimited, 600)), problemMsg(new ApiError(429, rateLimited, 541)));
  const wait = problemMsg(new ApiError(429, rateLimited, 600));
  assert.equal(wait.key, 'problems.rateLimitedWait');
  assert.deepEqual(wait.values, { minutes: 10 });
  assert.deepEqual(problemMsg(new ApiError(429, rateLimited, 5)).values, { minutes: 1 }, 'never "0 minutes"');
  assert.equal(problemMsg(new ApiError(429, rateLimited)).key, 'problems.codes.RATE_LIMITED', 'no header: the generic text');
});
