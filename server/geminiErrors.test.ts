import { describe, it, expect } from 'vitest';
import { describeGeminiError } from './geminiErrors';

describe('describeGeminiError', () => {
  it('flattens Google\'s JSON error body into one line', () => {
    const err = Object.assign(new Error('{"error":{"code":429,"message":"You exceeded your current quota.","status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });
    expect(describeGeminiError(err)).toBe('429 RESOURCE_EXHAUSTED - You exceeded your current quota.');
  });

  it('handles plain errors and timeouts', () => {
    expect(describeGeminiError(new Error('Timeout after 7000ms'))).toBe('Timeout after 7000ms');
    expect(describeGeminiError(undefined)).toBe('unknown error');
  });
});
