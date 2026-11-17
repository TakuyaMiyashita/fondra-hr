import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '@/lib/rate-limit';

/**
 * AI チャットのユーザー単位レート制限。
 *
 * デモの資格情報は公開されており、誰でもログインして LLM の課金を
 * 積み上げられる。上限ちょうどまでは通し、超えたら止めること、
 * ウィンドウが明けたら戻ること、ユーザー同士が干渉しないことを固定する。
 */

const T0 = 1_000_000;

describe('createRateLimiter', () => {
  it('上限ちょうどまでは通し、残り回数を返す', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(limiter.check('u1', T0)).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check('u1', T0)).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check('u1', T0)).toEqual({ allowed: true, remaining: 0 });
  });

  it('上限を超えたら拒否し、ウィンドウ明けまでの秒数を返す', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check('u1', T0);
    limiter.check('u1', T0);

    expect(limiter.check('u1', T0 + 10_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 50,
    });
  });

  it('残りが1秒未満でも Retry-After は1秒以上にする', () => {
    // 0 を返すとクライアントが即座に再送して、また弾かれる。
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', T0);

    expect(limiter.check('u1', T0 + 59_999)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it('ウィンドウが明けたらカウントが戻る', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', T0);
    expect(limiter.check('u1', T0 + 1).allowed).toBe(false);

    expect(limiter.check('u1', T0 + 60_000)).toEqual({ allowed: true, remaining: 0 });
  });

  it('キーごとに独立して数える', () => {
    // あるユーザーの濫用が、同じ組織の他のユーザーを巻き込まないこと。
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', T0);

    expect(limiter.check('u1', T0).allowed).toBe(false);
    expect(limiter.check('u2', T0).allowed).toBe(true);
  });

  it('reset で全カウンタを捨てる', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check('u1', T0);

    limiter.reset();

    expect(limiter.check('u1', T0).allowed).toBe(true);
  });

  it('now を省略すると現在時刻で数える', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(limiter.check('u1').allowed).toBe(true);
    expect(limiter.check('u1').allowed).toBe(false);
  });
});
