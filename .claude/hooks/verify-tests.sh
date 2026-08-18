#!/usr/bin/env bash
# Stop フック。
#
# ターンを終える前に、プロダクトコードとテストの整合が取れているか検証する。
# PostToolUse の提示は「気づき」でしかないので、実際の担保はここで行う。
#
# 実行するのは DB 不要な unit + カバレッジのみ（約15秒）。
# rls / integration / e2e はローカル Supabase の起動が前提で、
# 起動していない環境で毎回落ちると単なる邪魔になるため CI に任せる。
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# src/ と tests/ に未コミットの変更が無ければ何もしない。
# 調査だけのターンで毎回テストを回さないための足切り。
if git diff --quiet HEAD -- src tests 2>/dev/null && \
   [ -z "$(git ls-files --others --exclude-standard src tests 2>/dev/null)" ]; then
  exit 0
fi

output=$(pnpm test:coverage 2>&1)
if [ $? -eq 0 ]; then
  exit 0
fi

# 末尾だけ渡す。全文だと長すぎて要点が埋もれる。
tail=$(printf '%s' "$output" | tail -40)

jq -n --arg reason "$(printf 'src/ または tests/ に変更がありますが、pnpm test:coverage が失敗しています。\n修正するか、テストを更新してから完了してください。\n\n%s' "$tail")" \
  '{decision:"block", reason:$reason}'
