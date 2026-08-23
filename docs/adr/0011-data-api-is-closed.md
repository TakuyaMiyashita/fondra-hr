# 0011. Data API を閉じ、RLS の役割を実態に合わせる（0001 の前提を補う）

**状態**: 採用

## 背景

ADR 0001 で「RLS はテナント分離だけ、ロール別の認可は Service Layer」と決めた。
その前提には**書かれていない仮定**があった — _DB に届く経路は Service Layer だけ_ という仮定である。

これは成立していなかった。

Supabase は Data API（PostgREST）を既定で公開しており、`public` スキーマの
全テーブルに `grant select, insert, update, delete ... to authenticated` が
付いていた。anon キーはクライアントバンドルに載り、アクセストークンは
ブラウザから読める。つまりログイン中のユーザーは、Service Layer を通さずに
直接テーブルを叩けた。

RLS は `org_id` 一致しか見ないので、この経路では**ロールが一切効かない**。

```
PATCH /rest/v1/memberships?user_id=eq.<自分>
{"role":"owner"}
```

これが 200 で通り、次のトークン更新で `custom_access_token_hook` が
`memberships` を読み直して JWT の `role` が `owner` になる。
**viewer から組織の完全掌握までが数リクエストで到達できた。**

同じ経路で `employees.birth_date`・`one_on_ones.notes`・`evaluations.comment` の
全件読み出しと、全テーブルの書き込み・削除も通っていた。
`src/services/field-visibility.ts` と `src/services/self.ts` の作り込みは、
すべてこの経路で無効化されていた。

`tests/rls/` は**組織 A のユーザーが組織 B を見られないこと**しか検証しておらず、
同一組織内でのロール昇格を試すケースが1本も無かったため、気付けなかった。

## 決定

**Data API を `anon` / `authenticated` から閉じる。**
`public` の全テーブル・ビューについて GRANT を剥がす
（`supabase/migrations/20260822000001_revoke_data_api_grants.sql`）。

RLS ポリシー自体は残す。剥がすと将来 GRANT を戻したときに無防備になるため。

**あわせて、RLS の実効性について事実を明記する。**

Drizzle は `DATABASE_URL` で `postgres`（テーブル所有者）として接続する
（`src/db/index.ts`）。所有者に対して RLS は適用されない。つまり:

| 経路                            | RLS が効くか | 認可を担うもの |
| ------------------------------- | ------------ | -------------- |
| アプリ（RSC / Server Action）   | **効かない** | Service Layer  |
| Data API（PostgREST / GraphQL） | 効く         | — （閉鎖済み） |

**アプリの経路では RLS は一度も評価されていない。**
RLS が効くのは Data API だけで、そこは閉じた。したがって現状の RLS は
「GRANT を戻したときのための保険」であって、稼働中の防御層ではない。

## 理由

- **使っていない扉だから閉められる。** アプリは Data API を DB アクセスに
  使っていない。Supabase JS の用途は Auth と Storage に限定されている（ADR 0002）
- **RLS をロール対応にする案は採らない。** ADR 0001 の判断は今も妥当で、
  認可マトリクスを SQL に二重実装すると同じ考え違いを2箇所でするだけになる。
  扉を閉じる方が、条件を増やすより確実に検証できる
- **「二重防御」を名乗るなら実態が伴っていないといけない。** 実際には
  片方（RLS）はアプリ経路で一度も動いていなかった。動いていない防御層を
  数に入れると、Service Layer 側のレビューが甘くなる

## 捨てたもの

**接続ロールを非所有者に変え、RLS を実際に効かせる案。**
`app_user` のようなロールを作り、`force row level security` を掛ければ、
アプリ経路でも RLS が安全網として機能する。防御としてはこちらが上。

見送った理由は、マイグレーション・権限設計・全テストへの影響が大きく、
今回の穴（Data API の開放）とは独立した変更だから。扉を閉じれば
テナント分離は Service Layer が担保する形で完結する。
必要になった時点で別の ADR として判断する。

## 関連

- [0001. RLS にはテナント分離だけを持たせる](./0001-rls-is-tenant-isolation-only.md) — 本 ADR が前提を補う
- [0002. DB アクセスは Drizzle に一本化する](./0002-db-access-through-drizzle-only.md)
- [認可マトリクス](../database/authorization-matrix.md)
- [テナント分離](../architecture/multi-tenancy.md)
