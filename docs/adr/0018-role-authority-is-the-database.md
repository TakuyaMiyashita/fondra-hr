# 0018. ロールの権威は JWT の claim ではなく DB

**状態**: 採用

## 背景

`getAuthContext()` は `org_id` と `role` を JWT の `app_metadata` から読んでいた。
claim はカスタムアクセストークンフック（`custom_access_token_hook`）が
`memberships` を読んで埋めるので、**トークンを発行した時点では正しい**。

問題は、**発行後に変わっても claim は変わらない**こと。
`jwt_expiry = 3600` なので、既定で最大1時間ずれ続ける。

その間に管理者が

- `removeMember()` でメンバーを削除しても
- `changeRole()` で admin から viewer に降格させても

**本人の手元のトークンは元の権限のまま**で、Service Layer はそれを信じる。

### 実測

メンバーシップを service_role で削除した直後、同じセッションで
`/employees` を開いたところ、**追い出されず従業員20件が見えた**。

AGENTS.md は「Service Layer が唯一の経路であり、唯一の防御」と書いているが、
その防御が使う**身元そのものが古い**状態だった。

## 決定

**`role` は DB を権威にする。** `getAuthContext()` と
`getAuthContextForApi()` が、毎リクエスト `memberships` を1件引く
（`getActiveMembership(userId, orgId)`）。

- 行が無ければアクセスを打ち切る（取り消しが即座に効く）
- `role` は行の値を使う（降格が即座に効く）
- claim の `org_id` は「どの組織を見ているか」の指定としてだけ使う

## 理由

### なぜ毎リクエスト引くのか

`memberships` には `unique (user_id, org_id)` があり、索引1本で引ける。
1画面あたり既に複数のクエリを投げているので、1本増える影響より
「削除したのに1時間入れる」ほうが高くつく。

### なぜ claim を消さないのか

**Storage のポリシーが `auth.jwt()` を読む。** ブラウザから Supabase Storage を
直接叩く経路は Service Layer を通らないため、claim は引き続き要る
（`avatars` の書き込みは admin 以上）。claim は残したまま、
Service Layer の経路だけ DB を権威にする。

### なぜ `/login` ではなく `/auth/signout` へ飛ばすのか

**`/login` に直接リダイレクトするとループする。** メンバーシップが消えても
Supabase の認証自体は生きているため、ミドルウェアが「認証済み」と見て
ダッシュボードへ戻す。実際に `ERR_TOO_MANY_REDIRECTS` になった。

cookie を消せるのは Route Handler と Server Action だけで、**RSC では消せない**
（`src/lib/supabase/server.ts` の catch が握り潰している）。そのため
サインアウト用の Route Handler を用意し、そこで実際に破棄してから
ログイン画面へ送る。理由はクエリで伝える（黙って戻されると何が起きたか
分からない）。

## 捨てた案

| 案                                       | 却下理由                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| claim のまま `jwt_expiry` を短くする     | 窓が狭まるだけで閉じない。更新リクエストが増える                         |
| 削除・降格のときにセッションを失効させる | アプリ経由の操作しか塞げない。DB を直接触った場合に穴が残る              |
| ミドルウェアでメンバーシップを確認する   | ミドルウェアから `@/db` を触れない（`db-access` 検査に反する）           |
| 取り消し時に `/login` へリダイレクトする | ミドルウェアが認証済みと見てダッシュボードへ戻し、ループする（実測済み） |

## 影響

`tests/e2e/authorization.spec.ts` が、取り消し直後に締め出されることを
実セッションで確かめる。ユニット側は `role` が claim ではなく DB の値に
なること、メンバーシップが無いときサインアウトへ逃がすことを見る。

**組織切替（`switchOrganization`）は引き続き claim を更新する。**
どの組織を見ているかは claim が持つ情報なので、そちらの経路は変わらない。

## 関連

- [認可マトリクス](../database/authorization-matrix.md)
- [認証と認可](../architecture/auth-and-authorization.md)
