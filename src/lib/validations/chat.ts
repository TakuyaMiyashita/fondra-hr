import { z } from 'zod';

/**
 * AI チャットのリクエスト検証。
 *
 * **Route Handler も入力境界である。** Server Action と同じく、UI を経由しない
 * 呼び出しが常に可能な公開 POST エンドポイントで、届くのは未検証の値でしかない。
 * 検証が無いと `messages.findLast` が TypeError で落ち、500 とスタックを返す。
 *
 * **上限を置くのは費用のため。** README はデモ環境の資格情報を公開しており、
 * ログインは誰でもできる。ここは DB 書き込みではないので
 * デモの書き込み禁止（ADR 0012）の対象外で、素通しだと会話の長さに比例して
 * LLM の課金が積み上がる。
 */

/** 1リクエストで受け取る発言数の上限。往復25回ぶんで、通常の会話には足りる。 */
const MAX_MESSAGES = 50;

/** 1リクエストのテキスト総量の上限（文字）。 */
const MAX_TOTAL_TEXT = 20_000;

const textPart = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * **パートは text のみ受け付ける。** 以前は text 以外を素通ししていたが、
 * 総量チェックは text しか数えないため、`file` パート（data URL の画像・PDF 等）が
 * サイズ上限の対象外になっていた。クライアント（ai-assistant-client.tsx）が
 * 送るのは text だけなので、それ以外は拒否する。必要になったら型ごとに
 * 上限付きで追加すること。
 */
const messagePart = textPart;

/**
 * **role に `system` を含めない。** system はサーバー（system-prompt.ts）だけが
 * 与えるもので、クライアントから受け取るとシステムプロンプトの指示を
 * 上書きできてしまう。
 */
const chatMessage = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant'], { message: '無効なロールです' }),
  parts: z.array(messagePart).max(MAX_MESSAGES),
});

export const chatRequestSchema = z
  .object({
    messages: z
      .array(chatMessage)
      .min(1, 'メッセージがありません')
      .max(MAX_MESSAGES, `メッセージが多すぎます（最大${MAX_MESSAGES}件）`),
  })
  .refine(
    (value) =>
      value.messages.reduce(
        (total, message) => total + message.parts.reduce((sum, part) => sum + part.text.length, 0),
        0,
      ) <= MAX_TOTAL_TEXT,
    { message: `メッセージが長すぎます（合計${MAX_TOTAL_TEXT}文字まで）` },
  );

export type ChatRequest = z.infer<typeof chatRequestSchema>;
