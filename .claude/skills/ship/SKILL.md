---
name: ship
description: 作業中の変更を main にマージするところまで運ぶ。ブランチ作成 → 品質ゲート → コミット → PR 作成 → CI 監視 → squash マージ → main 同期。ユーザーが「ship して」「PR 出してマージまで」と言ったとき、または一連の実装作業を終えて main に入れる段階になったときに使う。
---

# ship — 変更を main まで運ぶ

このリポジトリで実際に回している手順。**途中で落ちたときの判断も含めて**書いてある。

## 0. 前提の確認

```bash
git branch --show-current && git status --short && gh pr list --state open
```

- **`main` にいたら必ずブランチを切る。** main は保護ブランチで直接コミットできない
  - 命名: `<type>/<短い説明>` (kebab-case)。type は `feat` `fix` `docs` `chore` `refactor` `test`
- 既にオープンな PR があれば、今の作業がそれと同じ話かを判断する。別の話なら別ブランチ
- 作業ツリーに無関係な変更が混ざっていないか見る

## 1. 品質ゲート

**コミット前に通す。** CI で落ちてから直すと PR のノイズになる。

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:coverage
```

`src/` にルートやコンポーネントを足したときは `pnpm build` も通す。
ファイル配置の誤り（`not-found.tsx` の置き場所など）は typecheck では出ず build で初めて出る。

ローカル Supabase が起動していれば、e2e まで手元で確認する。CI を待つより速い。

```bash
npx supabase status >/dev/null 2>&1 && pnpm test && pnpm test:e2e
```

### format:check がローカルだけ落ちるとき

prettier はリポジトリの `.gitignore` は読むが、ユーザーのグローバル ignore
（`~/.config/git/ignore`）は読まない。グローバル ignore でしか除外されていない
ファイルはローカルでのみ検査対象になる。**CI では起きない**ので、その差分が
原因なら追いかけなくてよい。

### カバレッジ閾値

`vitest.config.ts` の `coverage.thresholds`（statements/functions/lines 100、
branches 99）を下回ると落ちる。**達成した水準は下げない。** 閾値を緩めるのではなく
テストを足す。

## 2. コミット

Conventional Commits、**本文は日本語**（prefix は英語）。

件名だけで済ませない。**なぜそう変えたのかを本文に書く。**
とくに「調べた結果わかったこと」（フレームワークの API 変更、ライブラリの実装の
都合など）はコミットに残す価値がある。

```bash
git add -A && git commit -F - <<'EOF'
fix: 〜を修正する

何が問題だったか。なぜその直し方を選んだか。

- 変更点1
- 変更点2

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

## 3. PR を作る

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --base main --title "..." --body-file - <<'EOF'
...
EOF
```

PR 本文に入れるもの:

- **何が問題だったか**（症状ではなく原因）
- 選択肢が複数あったなら**捨てた案とその理由**
- 検証内容（通したコマンドと件数を具体的に。「テスト通過」ではなく「unit 1430件、
  カバレッジ 100/99.85/100/100 維持、e2e 92件」）
- **積み残し**があれば明示する。次に読む人が判断できるように

末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。

## 4. CI を待つ

```bash
gh pr checks <番号> --watch --interval 20
```

`Lint / Typecheck / Unit` と `RLS / E2E` の2ジョブ。合わせて5〜6分。

### 落ちたとき

まずログを見る。**内容ではなく main に遅れているだけ**のことがよくある。

```bash
gh run view <run-id> --log-failed | tail -40
```

main に遅れているなら rebase して force-push する。

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease origin "$(git branch --show-current)"
```

## 5. マージ

```bash
gh pr merge <番号> --squash
git switch main && git pull
```

**`--delete-branch` は付けない。**

スタックした PR（別の PR をベースにしている PR）があると、親を
`--delete-branch` でマージした時点で子が GitHub に自動クローズされる。
**ベース削除済みの PR は再オープンも base 変更もできない**
（`Cannot change the base branch of a closed pull request`）。
ブランチ自体は残るので main に rebase して新規 PR を立て直すしかない。

スタックさせるなら、親をマージする前に子を rebase して base を main に
付け替えておくこと。

## 6. 後始末

```bash
git log --oneline -3 && git status --short && gh pr list --state open
```

main が更新され、作業ツリーがクリーンで、意図しないオープン PR が
残っていないことを確認する。

## 報告

マージして終わりにしない。以下をユーザーに伝える。

- **調査でわかった非自明なこと**（当初の想定と違った点があれば必ず）
- 意図的にやらなかったこと（スコープ外にした理由つき）
- 次の候補

## やらないこと

- `main` への直接コミット
- 品質ゲートを飛ばしての PR 作成
- カバレッジ閾値の引き下げ
- 事実と違う完了報告。**落ちたテストは落ちたと言う**
