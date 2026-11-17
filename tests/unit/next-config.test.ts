import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config';

/**
 * セキュリティヘッダーの設定。
 *
 * next.config.ts は空のままでも動くため、誰かが整理のつもりで消しても
 * 何も落ちない。クリックジャッキング対策が黙って外れないよう固定する。
 */

describe('next.config', () => {
  it('X-Powered-By を出さない', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('全パスにセキュリティヘッダーを付ける', async () => {
    const rules = await nextConfig.headers!();

    const all = rules.find((r) => r.source === '/:path*');
    expect(all).toBeDefined();
    expect(Object.fromEntries(all!.headers.map((h) => [h.key, h.value]))).toEqual({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });
});
