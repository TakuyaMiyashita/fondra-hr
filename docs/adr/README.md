# Architecture Decision Records

設計上の判断とその理由を、決めた順に記録する。

## なぜ残すか

設計書は「今どうなっているか」を書くが、「なぜそう決めたか」「何を捨てたか」は
残らない。理由が残っていないと、後から入った人（AI エージェントを含む）が
同じ議論を最初からやり直し、既に却下した案を再提案する。

判断が変わったときは既存の ADR を書き換えず、**新しい ADR で上書きする**。
却下された理由も含めて履歴が残ることに価値がある。

## 書く基準

すべての判断を書く必要は無い。以下に当てはまるものだけ。

- 後から変えるのが高くつく（データモデル・認可の境界・環境構成）
- 複数の妥当な選択肢があり、片方を捨てた
- 素直に読むと不自然に見える（理由を知らないと「直したくなる」）

## 一覧

| #                                                                 | タイトル                                                      | 状態 |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| [0001](./0001-rls-is-tenant-isolation-only.md)                    | RLS にはテナント分離だけを持たせる                            | 採用 |
| [0002](./0002-db-access-through-drizzle-only.md)                  | DB アクセスは Drizzle に一本化する                            | 採用 |
| [0003](./0003-unlinked-user-sees-nothing.md)                      | 従業員レコードと未紐付けのユーザーは何も見えない側に倒す      | 採用 |
| [0004](./0004-evaluation-comment-disclosed-after-confirmation.md) | 評価コメントの本人開示は確定後のみ                            | 採用 |
| [0005](./0005-single-environment.md)                              | 本番環境を作らず検証環境ひとつで運用する                      | 採用 |
| [0006](./0006-defer-org-creation-until-email-confirmed.md)        | 組織作成をメール確認後まで遅らせる                            | 採用 |
| [0007](./0007-keep-email-confirmation-disabled.md)                | 検証環境ではメール確認を有効化しない                          | 採用 |
| [0008](./0008-skill-presets-live-in-code-not-in-db.md)            | スキルの入力候補は DB ではなくコードに置く                    | 採用 |
| [0009](./0009-form-a11y-wiring-lives-in-base-ui-field.md)         | フォームの a11y 配線は Base UI の Field に任せる              | 採用 |
| [0010](./0010-color-contrast-is-in-scope.md)                      | 配色のコントラストも担保する（0009 のスコープを上書き）       | 採用 |
| [0011](./0011-data-api-is-closed.md)                              | Data API を閉じ、RLS の役割を実態に合わせる（0001 を補う）    | 採用 |
| [0012](./0012-demo-org-is-read-only.md)                           | 公開デモの組織は閲覧専用にする                                | 採用 |
| [0013](./0013-health-check-runs-on-github-actions.md)             | 死活監視は GitHub Actions の cron に置き、失敗を Issue にする | 採用 |
| [0014](./0014-contrast-is-measured-on-rendered-text.md)           | コントラストは実テキストを走査して測る（0010 の手段を具体化） | 採用 |
| [0015](./0015-dashboard-charts-are-lazy-loaded.md)                | ダッシュボードのグラフは遅延読み込みする（総量は増える）      | 採用 |
