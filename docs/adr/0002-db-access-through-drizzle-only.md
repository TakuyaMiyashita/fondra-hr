# 0002. DB アクセスは Drizzle に一本化する

**状態**: 採用

## 背景

Supabase JS Client は `supabase.from('employees').select()` で DB を読み書きできる。
Drizzle ORM と併存させると、同じテーブルに2つの経路ができる。

## 決定

**DB の CRUD・集計は Drizzle ORM のみ**。Supabase JS Client は Auth と Storage に
限定する。`src/lib/supabase/admin.ts`（service_role）はテーブルを触らない。

## 理由

- **`org_id` の付与漏れを型で防げない経路を作らない。** Supabase Client を
  許すと、RSC やコンポーネントから直接クエリを書けてしまい、Service Layer を
  迂回する経路ができる。迂回されると `WHERE org_id` も監査ログも掛からない
- **service_role は RLS を丸ごとバイパスする。** この経路でテーブルを読み書き
  できるようにすると、テナント分離の前提が崩れる。用途を Auth Admin API
  （`app_metadata` の更新）に限定し、呼ぶ前に必ずメンバーシップを検証する

## 関連

- [レイヤードアーキテクチャ](../architecture/layered-architecture.md)
- [ADR 0001](./0001-rls-is-tenant-isolation-only.md)
