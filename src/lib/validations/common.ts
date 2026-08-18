import { z } from 'zod';

/**
 * ドメイン横断で使い回す検証部品。
 *
 * Zod の既定メッセージは英語（`Invalid uuid` / `Too big: expected number to be <=100`）で、
 * Server Action はそれをそのまま `err()` に載せて toast に出す。日本語 UI に英語の
 * 内部メッセージが露出するのを防ぐため、UI に届きうる規則には必ず文言を添える。
 *
 * 一覧クエリの値は URL（nuqs）由来でユーザーが直接書き換えられるため、
 * 「フォームに出ないから英語でよい」とは言えない。
 */

/** `無効な<ラベル>IDです` を返す UUID フィールド。 */
export const uuidField = (label: string) => z.string().uuid(`無効な${label}IDです`);

/** 一覧のページ番号。1 始まり。 */
export const pageField = z.coerce
  .number()
  .int('ページ番号が不正です')
  .min(1, 'ページ番号が不正です')
  .default(1);

/** 1ページあたり件数。上限 100 は全一覧共通。 */
export const perPageField = (defaultValue: number) =>
  z.coerce
    .number()
    .int('表示件数が不正です')
    .min(1, '表示件数は1以上で指定してください')
    .max(100, '表示件数は100以下で指定してください')
    .default(defaultValue);

/** 昇順・降順。 */
export const orderField = z.enum(['asc', 'desc'], { message: '並び順が不正です' }).default('desc');

/** 並び替え対象のカラム。指定できる値はドメインごとに異なる。 */
export const sortField = <const T extends readonly [string, ...string[]]>(
  values: T,
  defaultValue: T[number],
) => z.enum(values, { message: '並び替え項目が不正です' }).default(defaultValue);
