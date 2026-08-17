import { anthropic } from '@ai-sdk/anthropic';
import {
  streamText,
  type UIMessage,
  convertToModelMessages,
} from 'ai';

import { getAuthContextForApi } from './auth';
import { buildSystemPrompt } from './system-prompt';

export async function POST(req: Request) {
  const ctx = await getAuthContextForApi();
  if (!ctx) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const systemPrompt = await buildSystemPrompt(ctx);
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
