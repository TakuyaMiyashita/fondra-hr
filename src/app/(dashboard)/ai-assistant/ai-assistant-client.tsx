'use client';

import { Bot, Loader2, Send, User } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  '組織の概要を教えてください',
  '部署ごとの人数分布を教えてください',
  '評価サイクルの現状を教えてください',
  '人材育成のアドバイスをください',
];

export function AiAssistantClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: `msg-${++idCounter.current}`,
        role: 'user',
        content: text.trim(),
      };

      const assistantMsg: ChatMessage = {
        id: `msg-${++idCounter.current}`,
        role: 'assistant',
        content: '',
      };

      const allMessages = [...messages, userMsg];
      setMessages([...allMessages, assistantMsg]);
      setInput('');
      setIsLoading(true);
      scrollToBottom();

      try {
        const uiMessages = allMessages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: 'text' as const, text: m.content }],
        }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: uiMessages }),
        });

        if (!response.ok) {
          throw new Error('チャットAPIでエラーが発生しました');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('ストリームが取得できません');

        const decoder = new TextDecoder();
        let accumulated = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('0:')) continue;
            try {
              const text = JSON.parse(line.slice(2));
              if (typeof text === 'string') {
                accumulated += text;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accumulated,
                    };
                  }
                  return updated;
                });
                scrollToBottom();
              }
            } catch {
              // non-text chunk, skip
            }
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content:
                err instanceof Error
                  ? err.message
                  : 'エラーが発生しました。もう一度お試しください。',
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, scrollToBottom],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI アシスタント</h1>
          <p className="text-muted-foreground text-sm">組織の人材データについて質問できます</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
              <Bot className="text-primary size-8" />
            </div>
            <div className="text-center">
              <h2 className="text-lg font-semibold">何でも聞いてください</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                組織の人材データに基づいて回答します
              </p>
            </div>
            <div className="grid max-w-lg gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  className="h-auto text-left text-sm whitespace-normal"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Bot className="text-primary size-4" />
                  </div>
                )}
                <Card
                  className={`max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  <CardContent className="p-3">
                    {msg.content ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <Loader2 className="text-muted-foreground size-4 animate-spin" />
                    )}
                  </CardContent>
                </Card>
                {msg.role === 'user' && (
                  <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full">
                    <User className="size-4" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-background border-t px-6 py-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="min-h-10 resize-none"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
