import { anthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  type UIMessage,
  convertToModelMessages,
  simulateReadableStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';

import { getAuthContextForApi } from './auth';
import { buildSystemPrompt } from './system-prompt';

function createMockResponse(lastUserMessage: string) {
  const responses: Record<string, string> = {
    組織の概要を教えてください:
      'こちらはデモモードのため、実際のデータに基づく回答はできませんが、組織の概要画面ではダッシュボードから従業員数・部署数・スキル数・評価サイクル数を確認できます。詳細は各管理画面をご覧ください。',
    部署ごとの人数分布を教えてください:
      'デモモードのため実データの分析はできません。本番環境では、組織図画面で部署ごとの所属人数を確認でき、AI アシスタントがリアルタイムの人数分布を回答します。',
    評価サイクルの現状を教えてください:
      'デモモードです。本番環境では、進行中の評価サイクルの進捗状況（未提出・提出済み・確定済みの件数）を集計してお伝えします。評価画面から直接確認することもできます。',
    人材育成のアドバイスをください:
      'デモモードのため一般的なアドバイスになります。1on1 記録を定期的に残し、スキルマトリクスで各メンバーの強み・伸びしろを可視化することで、効果的な育成計画を立てられます。本番環境では組織のデータに基づいた具体的な提案を行います。',
  };

  return (
    responses[lastUserMessage] ??
    `これはデモモードの応答です。ANTHROPIC_API_KEY を設定すると、組織の人材データに基づいた AI による回答が利用できます。\n\nご質問: 「${lastUserMessage}」`
  );
}

export async function POST(req: Request) {
  const ctx = await getAuthContextForApi();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  if (!process.env.ANTHROPIC_API_KEY) {
    const lastMsg = messages.findLast((m) => m.role === 'user');
    const userText = lastMsg?.parts?.find((p) => p.type === 'text')?.text ?? '';
    const mockText = createMockResponse(userText);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const encoder = new TextEncoder();
        const readable = simulateReadableStream({
          chunks: mockText.split('').map((c) => encoder.encode(c)),
          initialDelayInMs: 100,
          chunkDelayInMs: 15,
        });
        const reader = readable.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writer.write({ type: 'text-delta', delta: decoder.decode(value), id: 'mock' });
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  }

  const systemPrompt = await buildSystemPrompt(ctx);
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
