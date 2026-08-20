# デプロイ手順（検証環境）

Vercel（アプリ）+ Supabase Cloud（DB / Auth / Storage）構成でのデプロイ手順。

## この手順が対象とする環境

**構築するのは検証環境ひとつだけで、本番環境は用意しない。**
実ユーザーを持たないプロジェクトであり、環境を分けても運用コストが増えるだけで
得るものが無いため。検証環境は以下の位置づけで扱う。

- 実データは入れない。壊れたら作り直してよい
- デモデータは自由に投入・削除してよい（`purge_organization()` で完全に消せる）
- 本番相当のドメインやカスタムドメインは設定しない

そのうえで、**本番として運用するなら何を変えるべきか**は各手順に併記する。
将来必要になった時点で、この手順書をそのまま本番構築に使えるようにしておくため。

## 前提

- Supabase Cloud のアカウント
- Vercel のアカウント
- ローカルで `pnpm build` が成功すること

## 1. Supabase Cloud プロジェクトの作成

[app.supabase.com](https://app.supabase.com) で新規プロジェクトを作成する。
リージョンは利用者に近い場所（日本向けなら Northeast Asia (Tokyo)）を選ぶ。

プロジェクト名には役割を含める（例 `fondra-hr-staging`）。
名前だけが「これは検証環境である」と示す唯一の手がかりになるため、
`fondra-hr` のような中立な名前は避ける。後から rename しても
**Project Ref は変わらない**ので、URL やキーの差し替えは不要。

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
> `supabase/seed.sql` は適用されない（デモデータはリモートに入らない）。これは意図した挙動。

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

`supabase config push` はこれを**そのままリモートへ書き込む**。つまりフックを
有効にするために push した結果、リモートの Site URL が `http://127.0.0.1:3000` になる。
パスワードリセットや確認メールのリンクが localhost を指すようになり、
リダイレクト許可リストからもデプロイ先のドメインが外れる。

そのため順序が重要になる。

1. `npx supabase config push`（フックを有効にする）
2. **その後で** Authentication → URL Configuration を開き、
   Site URL をデプロイ先のドメイン（例 `https://fondra-hr.vercel.app`）に設定し直す
3. Redirect URLs にも同じドメインを追加する

**この順序は `config push` を実行するたびに必要になる。** 手順2を省くと、
次回の push で Site URL が静かに localhost へ戻る。

検証環境では実害は小さい（パスワードリセットのメールリンクが localhost を指す程度）。
ただし**本番として運用する場合はここが致命傷になる**。パスワードリセットが機能せず、
かつ「メールが届くのにリンクを踏むと繋がらない」という形で表面化するため、
原因に辿り着くまでに時間を要する。

> `config.toml` の値を `env(SUPABASE_AUTH_SITE_URL)` のような環境変数参照に
> 置き換える方法もあるが、変数が未設定のままローカルで `supabase start` すると
> Site URL が空になる。ローカル開発の既定値を壊さないことを優先し、
> 現状はダッシュボードで直す運用にしている。

## 4. Vercel へのデプロイ

Vercel で GitHub リポジトリをインポートし、以下の環境変数を設定する。

| 変数                            | 値                                                 | 必須 |
| ------------------------------- | -------------------------------------------------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase の Project URL                            | 必須 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key                                           | 必須 |
| `SUPABASE_SERVICE_ROLE_KEY`     | service_role key                                   | 必須 |
| `DATABASE_URL`                  | 下記参照                                           | 必須 |
| `NEXT_PUBLIC_APP_URL`           | デプロイ先URL（例 `https://fondra-hr.vercel.app`） | 必須 |
| `ANTHROPIC_API_KEY`             | Anthropic の API キー                              | 任意 |

`ANTHROPIC_API_KEY` を設定しない場合、AI アシスタントはデモモードの固定応答を返す
（`src/app/api/chat/route.ts`）。機能自体は壊れない。

### 本番として運用する場合に変更が要る設定

検証環境では既定のままでよいが、実ユーザーを受け入れるなら以下は見直しが要る。

| 設定                              | 検証環境         | 本番で必要な変更                                     |
| --------------------------------- | ---------------- | ---------------------------------------------------- |
| `auth.email.enable_confirmations` | `false`（既定）  | `true`。無効の間は他人のメールアドレスでも登録できる |
| `site_url`                        | localhost のまま | 独自ドメイン。上記のとおり必須                       |
| `auth.rate_limit`                 | 緩め             | サインイン・OTP の上限を絞る                         |
| DB バックアップ                   | 不要             | 有料プランの PITR を検討                             |
| `minimum_password_length`         | `6`              | 8 以上を推奨                                         |

`enable_confirmations` は `supabase/config.toml` の `[auth.email]` にあり、
ローカル開発の利便性のため `false` にしてある。`config push` するとこの値が
そのまま反映される点に注意する。

#### enable_confirmations の有効化手順

**現状は有効化しない判断になっている**
（[ADR 0007](./adr/0007-keep-email-confirmation-disabled.md)）。
実装は有効・無効のどちらでも動くので、以下はその判断を覆すときの手順。

**メール送信の上限が先に問題になる。** 組み込みのメール送信は **2通/時**で、
サインアップ・招待・マジックリンク・パスワードリセットで共有する。
サインアップと招待を一度ずつ試すだけで上限に達するため、実質カスタム SMTP が
前提になる（カスタム SMTP なら 30通/時から、ダッシュボードで引き上げ可）。

カスタム SMTP を入れる場合、Resend のテスト用ドメインは**自分のアカウントの
アドレス宛にしか送れない**。任意の宛先に送るには独自ドメインの検証が要り、
`vercel.app` は DNS が管理下に無いため使えない。詳細と却下した案は ADR 0007。

トグル自体は、ホスティング先の Supabase プロジェクトで
Authentication → Providers → Email → Confirm email を有効にすれば足りる。
**`config push` では行わないこと** —— `supabase/config.toml` はローカル開発と
e2e のため `false` である必要があり、push すると `site_url` と
リダイレクト許可リストも同時にローカルの値へ戻る。

**ただし先に redirect の許可リストを確認すること。**
確認メールのリンクの戻り先 `<ドメイン>/auth/callback` が
`site_url` または `additional_redirect_urls` に載っている必要がある。

許可リストに無い `redirect_to` は **エラーにならず site_url に差し替えられる**。
その結果リンクが `/` に飛び、`/auth/callback` を通らないため保留中の
組織作成・招待受諾（`completePendingSignUp`）が消化されず、
**「確認済みだが組織が無い」ユーザー**が生まれる。有効化前にこの状態を
作らないための前提条件になる。

確認方法（ローカル / 該当プロジェクトの URL とキーに読み替える）:

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"signup","email":"probe@example.com","password":"password123",
       "redirect_to":"http://localhost:3000/auth/callback"}'
```

返ってくる `action_link` の `redirect_to` が指定どおりなら許可されている。
site_url に化けていれば許可リストへの追加が要る。

`supabase/config.toml` は `false` のままにしてある。ローカル開発と e2e は
サインアップから画面表示までを一続きで通すため、確認メールを挟むと
テストが成立しない。

##### なぜ実装の変更が要ったか

`signUp` と招待受諾は、以前は Auth ユーザーを作った直後に組織・メンバーシップを
作っていた。メール確認を有効にすると `signUp()` はセッションを返さない
（未確認のため）が、組織の作成はそのまま走るので次の状態が生まれていた。

- 確認されなかった登録のぶんだけ、**誰も入れない組織が DB に残り続ける**
- 招待経路はさらに悪く、`acceptInvitation` が `accepted_at` を立てるため
  **確認しないまま招待だけが消費される**。本人はログインできず、
  管理者は再招待が必要になる

##### 現在の流れ

作成内容を `user_metadata` に預け、確認後に消化する。

1. `signUp()` の `options.data` に `pending_org_name`（招待経路は
   `pending_invitation_token`）を入れ、`emailRedirectTo` を
   `/auth/callback` に向ける
2. セッションが返らなければ（＝確認待ち）**何も作らず**
   `/login?registered=true` へ送る
3. 確認リンクから `/auth/callback` に戻ったところで
   `completePendingSignUp()`（`src/services/auth.ts`）が組織作成 / 招待受諾を
   実行し、預けた metadata を消してセッションをリフレッシュする

確認が無効な場合は `signUp()` がセッションを返すため、従来どおりその場で
作成する。どちらの設定でも動く。

`user_metadata` は**クライアントから書き換えられる**領域である点に注意する。
`completePendingSignUp()` は預かった値を信用せず、招待をトークンで引き直し、
**確認済みメールとの一致**と**未所属であること**を改めて検証する。ここを
省くと、トークンを入手した第三者が別アドレスのアカウントで組織に参加できる。

なお、確認が無効な現状で `signUp()` が返すセッションは**組織を作る前**に
発行されるため、JWT の `app_metadata.org_id` が null になる。これを持ったまま
画面に入るとリダイレクトループになるため、組織作成後に `refreshSession()` を
挟んでいる。この経路を触るときは同じ順序を壊さないこと。

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
4. 2つ目の組織を作り、**組織スイッチャーで切り替えるとデータが入れ替わる**

症状と原因の対応は以下のとおり。

| 症状                                   | 疑うべき箇所                                      |
| -------------------------------------- | ------------------------------------------------- |
| ログインできるが全画面が空             | 手順3の Auth フック設定漏れ                       |
| 組織を切り替えても表示が変わらない     | `SUPABASE_SERVICE_ROLE_KEY` 未設定                |
| パスワードリセットのリンクが localhost | 手順3の Site URL 再設定漏れ                       |
| 画面は出るが一覧が常に空               | `DATABASE_URL` の向き先（プーラーのポート）を確認 |

手順4 は `SUPABASE_SERVICE_ROLE_KEY` が正しく設定されていないと動かない。
組織切替は JWT の `app_metadata` を Auth Admin API で書き換える実装であり、
このキーが無いとサーバー側でエラーになる（`src/lib/supabase/admin.ts`）。
フックの疎通と service_role の疎通を一度に確認できるので、必ず通しておく。

## 補足: 検証環境でのデモデータ

`supabase/seed.sql` はローカル専用（`supabase db reset` 時にのみ実行される）。
検証環境でデモ組織を見せたい場合は、アプリ上でサインアップして手動で作成するか、
seed.sql の内容をリモート DB に対して明示的に実行する。

いずれの場合も `purge_organization()` で組織ごと完全に削除できる
（`docs/architecture/multi-tenancy.md` 参照）。監査ログは追記専用トリガーで
保護されているため通常の `DELETE` では消えず、この関数を使う必要がある。

検証環境は壊れても作り直せる前提なので、デモデータの投入は気軽に行ってよい。
再構築は `link` → `db push` → `config push` の3コマンドで完了する。
