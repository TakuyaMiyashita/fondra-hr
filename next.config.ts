import type { NextConfig } from 'next';

/**
 * 全レスポンスに付けるセキュリティヘッダー。
 *
 * - `X-Frame-Options: DENY` — 他サイトの iframe への埋め込みを禁じる
 *   （メンバー削除・ロール変更などを重ねて押させるクリックジャッキング対策）。
 *   CSP の `frame-ancestors 'none'` でも同じことができるが、CSP は nonce 方式を
 *   含めて本格導入するときにまとめて設計する。それまではこちらで代替する。
 * - `X-Content-Type-Options: nosniff` — Content-Type を推測させない。
 * - `Referrer-Policy: strict-origin-when-cross-origin` — 外部へはオリジンだけ送る。
 *   パス（従業員 ID 等）を外部に漏らさない。
 * - `Permissions-Policy` — 使っていないブラウザ機能を明示的に閉じる。
 */
export const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // X-Powered-By: Next.js を出さない（使っているフレームワークを宣伝しない）。
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
