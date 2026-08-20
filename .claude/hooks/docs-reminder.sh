#!/usr/bin/env bash
# PostToolUse(Write|Edit) フック。
#
# test-reminder.sh の設計書版。src/ を編集したとき、そのファイルが
# 「どの設計書と対になっているか」を名指しで提示する。
#
# 設計書の更新は忘れても何も落ちないため、気付ける仕組みが無いと必ず遅れる。
# AGENTS.md が「古い図は無いより悪い」と書いているのは、遅れた図を
# エージェントが仕様として読んで実装を壊すため。
#
# 判定のみで、内容の正しさは見ない。機械的に検出できる分
# （画面一覧の欠落・リンク切れ等）は scripts/audit.mjs と CI が担保する。
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)

case "$file" in
  */src/*) ;;
  *) exit 0 ;;
esac

rel="src/${file#*/src/}"

# 1ファイルが複数の設計書に効くため、case のフォールスルー（bash 4 の `;;&`）
# ではなく個別の判定を重ねる。macOS の bash は 3.2 で `;;&` を解釈しない。
docs=""
add() { docs="${docs}\n  - $1"; }

case "$rel" in
  src/app/*/page.tsx | src/app/*/*/page.tsx | src/app/*/*/*/page.tsx)
    add "docs/design/screen-inventory.md（画面と状態定義。通常/ローディング/空/エラー）"
    ;;
esac

case "$rel" in
  src/app/\(auth\)/* | src/app/auth/* | src/proxy.ts | src/lib/supabase/middleware.ts)
    add "docs/design/user-flows.md（サインアップ・ログイン・招待承認のフロー図）"
    add "docs/architecture/auth-and-authorization.md"
    ;;
esac

case "$rel" in
  src/services/*)
    add "docs/api/service-layer.md（サービスのシグネチャと責務）"
    add "docs/database/authorization-matrix.md（ロール別の可否）"
    add "docs/design/user-flows.md（1on1・評価のフローを変えた場合）"
    ;;
esac

case "$rel" in
  src/db/schema/*)
    add "docs/database/er-diagram.md（ER 図）"
    add "docs/database/rls-policy.md（RLS ポリシー）"
    ;;
esac

case "$rel" in
  src/components/ui/* | src/components/shared/*)
    add "docs/design/ui-guidelines.md（コンポーネントの作法）"
    ;;
esac

[ -z "$docs" ] && exit 0

msg="プロダクトコードを編集しました: ${rel}\n\n対になる設計書（実態から遅れていないか確認）:${docs}"
msg="${msg}\n\nフロー図を変える実装をしたなら図も直すこと。古い図は無いより悪い。"
msg="${msg}\n\n後から変えるのが高くつく判断・複数の選択肢から片方を捨てた判断なら docs/adr/ に ADR を残す。判断が変わったときは既存の ADR を書き換えず、新しい ADR で上書きする（却下の理由も履歴として残す）。"

jq -n --arg ctx "$(printf '%b' "$msg")" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
