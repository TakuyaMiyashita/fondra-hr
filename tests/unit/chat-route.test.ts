import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AI チャット（POST /api/chat）の費用面の歯止め。
 *
 *   - ユーザー単位のレート制限（1分あたり20リクエスト）を超えたら 429
 *   - 制限はユーザーごとに独立している
 *   - streamText に出力トークンの上限を渡している
 *
 * 認証・システムプロンプト・LLM 呼び出しはモックにして、配線だけを見る。
 */

const { getAuthContextForApi, streamText, convertToModelMessages } = vi.hoisted(() => ({
  getAuthContextForApi: vi.fn(),
  streamText: vi.fn(),
  convertToModelMessages: vi.fn(),
}));

vi.mock('@/app/api/chat/auth', () => ({ getAuthContextForApi }));
vi.mock('@/app/api/chat/system-prompt', () => ({
  buildSystemPrompt: vi.fn(async () => 'system'),
}));
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => 'model') }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText,
  convertToModelMessages,
}));

const BODY = { messages: [{ role: 'user', parts: [{ type: 'text', text: 'こんにちは' }] }] };

function request(body: unknown = BODY) {
  return new Request('https://app.example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** モジュールの状態（レート制限のカウンタ）をテストごとに作り直す。 */
async function route() {
  vi.resetModules();
  return import('@/app/api/chat/route');
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  getAuthContextForApi.mockResolvedValue({ userId: 'user-1', orgId: 'org-1', role: 'member' });
  convertToModelMessages.mockResolvedValue([]);
  streamText.mockReturnValue({ toUIMessageStreamResponse: () => new Response('ok') });
  // 既定はモック応答（API キー無し）の経路で数える。
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe('POST /api/chat — レート制限', () => {
  it('1分あたり20リクエストまでは通し、21回目は 429 と Retry-After を返す', async () => {
    const { POST } = await route();

    for (let i = 0; i < 20; i++) {
      expect((await POST(request())).status).toBe(200);
    }

    const res = await POST(request());
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({
      error: 'リクエストが多すぎます。しばらく待ってからやり直してください',
    });
  });

  it('壊れたリクエストも回数に数える', async () => {
    // 検証で弾かれる入力の連打も濫用のうち。検証より前で数える。
    const { POST } = await route();

    for (let i = 0; i < 20; i++) {
      expect((await POST(request({}))).status).toBe(400);
    }

    expect((await POST(request())).status).toBe(429);
  });

  it('制限はユーザーごとに独立している', async () => {
    const { POST } = await route();
    for (let i = 0; i < 20; i++) await POST(request());
    expect((await POST(request())).status).toBe(429);

    getAuthContextForApi.mockResolvedValue({ userId: 'user-2', orgId: 'org-1', role: 'member' });

    expect((await POST(request())).status).toBe(200);
  });

  it('未認証は回数に数えず 401', async () => {
    const { POST } = await route();
    getAuthContextForApi.mockResolvedValue(null);

    expect((await POST(request())).status).toBe(401);
  });
});

describe('POST /api/chat — 出力上限', () => {
  it('streamText に maxOutputTokens を渡す', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { POST } = await route();

    await POST(request());

    expect(streamText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 2000 }));
  });
});
