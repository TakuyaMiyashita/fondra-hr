/**
 * リダイレクト先として受け取ったパスを検証する。
 *
 * `/auth/callback?next=...` のように、遷移先を URL で受け取る経路は
 * **オープンリダイレクト**の足場になる。`${origin}${next}` と連結するだけだと、
 * `next=@evil.example` で `https://app@evil.example`（ホストは evil.example）、
 * `next=//evil.example` でプロトコル相対 URL になり、外部へ飛ばせてしまう。
 *
 * そこで「`/` で始まり、`//` や `/\` で始まらない相対パス」だけを許可する。
 * `/\` を弾くのは、ブラウザが `\` を `/` と同一視して `//` と解釈するため。
 * さらに `new URL(path, origin)` で組み立て、オリジンが変わらないことも確かめる
 * （制御文字の混入などで解釈がずれる入力への保険）。
 *
 * 条件に合わないものは既定値に落とす。エラーにしないのは、正規の利用者が
 * 壊れたリンクを踏んだときにもアプリへは入れるようにするため。
 */
export const DEFAULT_REDIRECT_PATH = '/employees';

export function safeRedirectPath(
  next: string | null | undefined,
  origin: string,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }

  let url: URL;
  try {
    url = new URL(next, origin);
  } catch {
    return fallback;
  }

  if (url.origin !== new URL(origin).origin) {
    return fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
