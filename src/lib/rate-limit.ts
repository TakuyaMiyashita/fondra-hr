/**
 * キー（ユーザー ID 等）ごとの簡易レート制限。固定ウィンドウ方式。
 *
 * **インメモリであることの制約（必ず理解して使うこと）:**
 * - 状態はこのプロセスのメモリにしか無い。サーバーレス（Vercel 等）では
 *   インスタンスごとにカウンタが分かれ、コールドスタートで消える。
 *   複数インスタンスに分散されると、実効上限は「上限 × インスタンス数」になる。
 * - したがってこれは**濫用の勢いを削ぐための最低限の歯止め**であり、
 *   課金の上限を保証するものではない。厳密な制限が要るなら、共有ストア
 *   （Upstash Redis 等）を使う実装に置き換えること（ライブラリ追加は
 *   AGENTS.md の手順に従う）。
 *
 * 依存を増やさずに入れられる範囲として、ここまでに留めている。
 */

export type RateLimitResult =
  { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

type Window = { count: number; resetAt: number };

export type RateLimiter = {
  /** 1回分を消費して、許可されるかを返す。 */
  check(key: string, now?: number): RateLimitResult;
  /** テスト用。全カウンタを捨てる。 */
  reset(): void;
};

export function createRateLimiter({
  limit,
  windowMs,
}: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, Window>();

  /**
   * 期限切れのエントリを捨てる。放っておくと、一度でも来たユーザーの
   * エントリがプロセスの寿命まで残り続ける。
   */
  function sweep(now: number) {
    for (const [key, w] of windows) {
      if (w.resetAt <= now) windows.delete(key);
    }
  }

  return {
    check(key, now = Date.now()) {
      sweep(now);

      const current = windows.get(key);
      if (!current) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: limit - 1 };
      }

      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
      }

      current.count += 1;
      return { allowed: true, remaining: limit - current.count };
    },
    reset() {
      windows.clear();
    },
  };
}
