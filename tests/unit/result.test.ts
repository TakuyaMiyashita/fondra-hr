import { describe, expect, it } from 'vitest';

import { err, ok } from '@/lib/result';

describe('Result type helpers', () => {
  it('ok() creates a success result', () => {
    const result = ok(42);
    expect(result).toEqual({ success: true, data: 42 });
  });

  it('err() creates a failure result', () => {
    const result = err('something went wrong');
    expect(result).toEqual({ success: false, error: 'something went wrong' });
  });
});
