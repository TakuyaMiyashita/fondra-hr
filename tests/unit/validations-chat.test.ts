import { describe, expect, it } from 'vitest';

import { chatRequestSchema } from '@/lib/validations/chat';

/**
 * AI チャットのリクエスト検証。
 *
 * ここが無いと Route Handler が TypeError で落ち、500 とスタックを返していた。
 * 検証の役目は2つある。**壊れた入力を 400 に落とすこと**と、
 * **費用の上限を置くこと**（README がデモの資格情報を公開しているため、
 * 誰でもログインして会話を投げられる）。
 */

const textMessage = (text: string, role: 'user' | 'assistant' = 'user') => ({
  role,
  parts: [{ type: 'text' as const, text }],
});

describe('chatRequestSchema', () => {
  it('クライアントが実際に送る形を通す', () => {
    // ai-assistant-client.tsx が送るのは { id, role, parts: [{type:'text', text}] }。
    const result = chatRequestSchema.safeParse({
      messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'こんにちは' }] }],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['messages が無い', {}],
    ['messages が配列でない', { messages: 'oops' }],
    ['messages が空', { messages: [] }],
    ['role が想定外', { messages: [{ role: 'root', parts: [] }] }],
    ['parts が配列でない', { messages: [{ role: 'user', parts: 'x' }] }],
  ])('%s → 失敗する', (_label, input) => {
    // どれも以前は 500（TypeError）になっていた入力。
    expect(chatRequestSchema.safeParse(input).success).toBe(false);
  });

  it('発言数の上限を超えたら失敗する', () => {
    const messages = Array.from({ length: 51 }, () => textMessage('やあ'));

    const result = chatRequestSchema.safeParse({ messages });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('最大50件');
    }
  });

  it('発言数が上限ちょうどなら通す', () => {
    const messages = Array.from({ length: 50 }, () => textMessage('やあ'));

    expect(chatRequestSchema.safeParse({ messages }).success).toBe(true);
  });

  it('テキストの総量が上限を超えたら失敗する', () => {
    // 1通が短くても、積み上げれば課金は増える。合計で見る。
    const messages = Array.from({ length: 3 }, () => textMessage('あ'.repeat(7_000)));

    const result = chatRequestSchema.safeParse({ messages });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('20000文字');
    }
  });

  it('テキストの総量が上限ちょうどなら通す', () => {
    const messages = [textMessage('あ'.repeat(20_000))];

    expect(chatRequestSchema.safeParse({ messages }).success).toBe(true);
  });

  it('text 以外のパートは素通しする', () => {
    // AI SDK がパート種別を増やしても壊れないようにしておく。
    const result = chatRequestSchema.safeParse({
      messages: [{ role: 'assistant', parts: [{ type: 'reasoning', detail: 'x' }] }],
    });

    expect(result.success).toBe(true);
  });
});
