# デプロイ手順

Vercel（アプリ）+ Supabase Cloud（DB / Auth / Storage）構成でのデプロイ手順。

## 前提

- Supabase Cloud のアカウント
- Vercel のアカウント
- ローカルで `pnpm build` が成功すること

## 1. Supabase Cloud プロジェクトの作成

[app.supabase.com](https://app.supabase.com) で新規プロジェクトを作成する。
リージョンは利用者に近い場所（日本向けなら Northeast Asia (Tokyo)）を選ぶ。

作成後、以下を控えておく。

| 値            | 取得場所                                            |
| ------------- | --------------------------------------------------- |
| Project URL   | Settings → API → Project URL                        |
| anon key      | Settings → API → Project API keys → `anon` `public` |
| DB パスワード | プロジェクト作成時に設定したもの                    |
| Project Ref   | Settings → General → Reference ID                   |

CLI からも作成できる。パスワードを端末の履歴やログに残したくない場合はこの形が扱いやすい。

```bash
# organization_id は `npx supabase orgs list` で確認
PW=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
npx supabase projects create fondra-hr \
  --org-id <org-id> --region ap-northeast-1 --db-password "$PW"
```

生成したパスワードは `.env.production.local` など `.gitignore` 済みのファイルに
保存しておく（`.gitignore` の `.env*` に含まれる）。DB パスワードは後で
`DATABASE_URL` の組み立てに必要になり、**紛失時は再設定するしかない**。

API キーは作成後に CLI からも取得できる。

```bash
npx supabase projects api-keys --project-ref <project-ref>
```

## 2. マイグレーションの適用

```bash
# CLI をクラウドアカウントに接続（ブラウザが開く）
npx supabase login

# ローカルプロジェクトをクラウドプロジェクトに紐付け
npx supabase link --project-ref <project-ref>

# マイグレーションを適用
npx supabase db push
```

> ブラウザを開けない環境では、[personal access token](https://supabase.com/dashboard/account/tokens)
> を発行して `SUPABASE_ACCESS_TOKEN` に設定すれば `login` を省略できる。
> 発行したトークンは全プロジェクトを操作できるため、共有端末やログに残さないこと。

> 新規プロジェクトなど、リモートに `schema_migrations` の履歴が無い状態では
> `npx supabase db push --include-all` を使う（履歴より古いマイグレーションも
> 適用対象に含める）。

> **注意**: `supabase db push` が適用するのは `supabase/migrations/` のみ。
> `supabase/seed.sql` は適用されない（デモデータは本番に入らない）。これは意図した挙動。

## 3. Auth 設定の反映 ← 忘れやすい

**`supabase db push` は `config.toml` の内容を反映しない。** 別コマンドが必要。

```bash
npx supabase config push
```

本プロジェクトは JWT に `org_id` / `role` を埋め込む Custom Access Token Hook に
依存している（`supabase/config.toml`）。

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

このフックが有効でないと JWT に `app_metadata.org_id` が入らず、
`current_org_id()` が NULL を返し、**全 RLS ポリシーが一致せずデータが一切見えなくなる**。
「ログインはできるがどの画面も空」という症状になったら、まずここを疑う。

ダッシュボードから設定する場合は Authentication → Hooks → Customize Access Token (JWT) Claims で
`public.custom_access_token_hook` を指定する。

### config push は Site URL をローカルの値で上書きする

`config.toml` の `[auth]` はローカル開発用の値が入っている。

```toml
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["https://127.0.0.1:3000"]
```

`supabase config push` はこれを**そのまま本番へ書き込む**。つまりフックを
有効にするために push した結果、本番の Site URL が `http://127.0.0.1:3000` になる。
パスワードリセットや確認メールのリンクが localhost を指すようになり、
リダイレクト許可リストからも本番ドメインが外れる。

そのため順序が重要になる。

1. `npx supabase config push`（フックを有効にする）
2. **その後で** Authentication → URL Configuration を開き、
   Site URL を本番ドメイン（例 `https://fondra-hr.vercel.app`）に設定し直す
3. Redirect URLs にも本番ドメインを追加する

**この順序は `config push` を実行するたびに必要になる。** 手順2を省くと、
次回の push で本番の Site URL が静かに localhost へ戻る。

> `config.toml` の値を `env(SUPABASE_AUTH_SITE_URL)` のような環境変数参照に
> 置き換える方法もあるが、変数が未設定のままローカルで `supabase start` すると
> Site URL が空になる。ローカル開発の既定値を壊さないことを優先し、
> 現状はダッシュボードで直す運用にしている。

## 4. Vercel へのデプロイ

Vercel で GitHub リポジトリをインポートし、以下の環境変数を設定する。

| 変数                            | 値                                           | 必須 |
| ------------------------------- | -------------------------------------------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase の Project URL                      | 必須 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                                     | 必須 |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key                             | 必須 |
| `DATABASE_URL`                  | 下記参照                                     | 必須 |
| `NEXT_PUBLIC_APP_URL`           | 本番URL（例 `https://fondra-hr.vercel.app`） | 必須 |
| `ANTHROPIC_API_KEY`             | Anthropic の API キー                        | 任意 |

`ANTHROPIC_API_KEY` を設定しない場合、AI アシスタントはデモモードの固定応答を返す
（`src/app/api/chat/route.ts`）。機能自体は壊れない。

### SUPABASE_SERVICE_ROLE_KEY に NEXT_PUBLIC_ を付けない

組織切替は JWT フックが読む `app_metadata` を書き換える必要があり、これは
service_role の Auth Admin API でしか行えない（`src/lib/supabase/admin.ts`）。
未設定だと組織スイッチャーがエラーになる。

**このキーは RLS を丸ごとバイパスする。** `NEXT_PUBLIC_` を付けるとクライアント
バンドルに埋め込まれ、全テナントのデータが誰からでも読み書きできる状態になる。
Vercel の環境変数では Production / Preview の両方に設定し、変数名は必ず
`SUPABASE_SERVICE_ROLE_KEY`（プレフィックス無し）にすること。

### DATABASE_URL はトランザクションプーラーを使う

Vercel はサーバーレス実行のため、リクエストごとにインスタンスが増減する。
直接接続（ポート 5432）を使うと接続数を使い切るため、
**Transaction Pooler（ポート 6543）** の接続文字列を使う。

Supabase の Settings → Database → Connection string → Transaction pooler から取得する。

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

`src/db/index.ts` は `prepare: false` を指定済みで、これはトランザクションプーラー利用時に必須
（プリペアドステートメントがセッションを跨げないため）。

> サーバーレスで接続数が逼迫する場合は、`postgres()` の `max` を小さく（1〜2）することを検討する。
> 現状は既定値のままなので、負荷をかけた際に接続エラーが出たらここを調整する。

## 5. デプロイ後の確認

1. サインアップして組織を作成できる
2. ログイン後、従業員一覧が表示される（空状態でよい）
3. 従業員を1件登録し、監査ログに記録されることを確認する

2 で「ログインできるが全画面が空」の場合は **手順3の Auth フック設定漏れ**。

## 補足: 本番でのデモデータ

`supabase/seed.sql` はローカル専用（`supabase db reset` 時にのみ実行される）。
本番でデモ組織を見せたい場合は、アプリ上でサインアップして手動で作成するか、
seed.sql の内容を本番 DB に対して明示的に実行する。後者を行う場合、
`purge_organization()` でいつでも完全に削除できる（`docs/architecture/multi-tenancy.md` 参照）。
