import type { Metadata } from 'next';

import { AiAssistantClient } from './ai-assistant-client';

export const metadata: Metadata = {
  title: 'AIアシスタント',
};

export default function AiAssistantPage() {
  return <AiAssistantClient />;
}
