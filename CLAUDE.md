@AGENTS.md

<!-- このファイルは AGENTS.md を取り込むだけ。規約の本体は AGENTS.md に置く。 -->
<!-- AGENTS.md は Linux Foundation 傘下で管理される横断標準で、Claude Code 以外の -->
<!-- エージェントも読む。Claude Code は @-import で上記1行から内容を取り込む。 -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
