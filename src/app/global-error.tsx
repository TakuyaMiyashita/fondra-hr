'use client';

// global-error はルートレイアウトを差し替えて描画されるため、`globals.css` も
// next-themes によるテーマ属性も届かない。Tailwind のクラスは効かないので
// インラインの style と prefers-color-scheme だけで組み立てる。
// Client Component のため metadata は export できず、タイトルは <title> で与える。
const styles = `
  :root { color-scheme: light dark; --fg: #0a0a0a; --muted: #737373; --bg: #ffffff; --accent: #171717; --accent-fg: #fafafa; }
  @media (prefers-color-scheme: dark) {
    :root { --fg: #fafafa; --muted: #a3a3a3; --bg: #0a0a0a; --accent: #fafafa; --accent-fg: #171717; }
  }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: ui-sans-serif, system-ui, sans-serif;
    display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 1rem;
  }
  .wrap { text-align: center; max-width: 28rem; }
  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.025em; margin: 0 0 0.5rem; }
  p { color: var(--muted); font-size: 0.875rem; margin: 0 0 1.5rem; }
  button {
    background: var(--accent); color: var(--accent-fg); border: 0; cursor: pointer;
    border-radius: 0.375rem; padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 500;
  }
`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    // global-error must include html and body tags
    <html lang="ja">
      <body>
        <title>問題が発生しました | FondraHR</title>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <div className="wrap">
          <h1>問題が発生しました</h1>
          <p>
            アプリケーションの読み込み中にエラーが発生しました。時間をおいて再度お試しください。
            {error.digest ? ` (エラーID: ${error.digest})` : ''}
          </p>
          <button onClick={retry}>再試行</button>
        </div>
      </body>
    </html>
  );
}
