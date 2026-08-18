#!/usr/bin/env bash
# PostToolUse(Write|Edit) フック。
#
# src/ 配下のプロダクトコードが編集されたとき、対応するテストファイルを
# 名指しで提示する。「テストも書いて」という一般論ではなく、
# どのファイルを更新すべきかまで出すことで実際に更新されるようにする。
#
# 判定のみで、テストの実行はしない（編集のたびに走ると遅いため）。
# 実際の担保は Stop フック（verify-tests.sh）と CI が行う。
set -uo pipefail

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)

# src/ 配下でなければ何もしない
case "$file" in
  */src/*) ;;
  *) exit 0 ;;
esac

# リポジトリルートからの相対パスに正規化
rel="src/${file#*/src/}"

targets=""
note=""

case "$rel" in
  src/services/*.ts)
    base=$(basename "$rel" .ts)
    targets="tests/unit/${base}-service.test.ts"
    note="認可の境界（許可される最下位ロールとその1つ下）、org_id の付与、監査ログの内容を検証すること。"
    ;;
  src/app/*/actions.ts | src/app/*/*/actions.ts | src/app/*/*/*/actions.ts)
    dir=$(dirname "$rel")
    domain=$(basename "$dir" | tr -d '()[]')
    targets="tests/unit/${domain%s}-actions.test.ts"
    note="Server Action は未認証で到達しうる公開 POST エンドポイント。Zod 失敗時に Service へ到達しないこと / revalidatePath は成功時のみ / AuthorizationError の変換 / それ以外の例外を握り潰さず再 throw、の全経路を通すこと。"
    ;;
  src/lib/validations/*.ts)
    targets="tests/unit/validations-*.test.ts"
    note="Zod スキーマは import しただけでカバレッジ 100% と表示されるため数値は当てにならない。境界値（上限ちょうど／+1）、不正形式、enum 外の値を明示的に通すこと。"
    ;;
  src/lib/*.ts)
    base=$(basename "$rel" .ts)
    targets="tests/unit/lib-${base}.test.ts"
    ;;
  src/app/*/page.tsx | src/app/*/*/page.tsx | src/app/*/*/*/page.tsx)
    dir=$(dirname "$rel")
    screen=$(basename "$dir" | tr -d '()[]')
    targets="tests/e2e/${screen}.spec.ts"
    note="画面の追加・変更は e2e の対象。空状態でも成立するアサーションにすること（e2e 用組織はシードデータを持たない）。"
    ;;
  *)
    exit 0
    ;;
esac

# 存在するものと、これから作る必要があるものを区別して伝える
status=""
for t in $targets; do
  if compgen -G "$t" >/dev/null 2>&1; then
    status="${status}\n  - ${t}（既存 → 更新が必要か確認）"
  else
    status="${status}\n  - ${t}（未作成 → 新規作成を検討）"
  fi
done

msg="プロダクトコードを編集しました: ${rel}\n\n対応するテスト:${status}"
[ -n "$note" ] && msg="${msg}\n\n観点: ${note}"
msg="${msg}\n\n編集が仕様変更を含むなら、テストを更新してから作業を完了してください。"

jq -n --arg ctx "$(printf '%b' "$msg")" \
  '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$ctx}}'
