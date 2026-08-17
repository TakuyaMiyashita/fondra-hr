import type { Metadata } from 'next';

import { getAuthContext } from '@/lib/auth';
import { getOrgInfo } from '@/services/settings';

import { SettingsGeneralClient } from './settings-general-client';

export const metadata: Metadata = {
  title: '設定',
};

export default async function SettingsPage() {
  const ctx = await getAuthContext();
  const result = await getOrgInfo(ctx);

  if (!result.success) {
    throw new Error(result.error);
  }

  return <SettingsGeneralClient org={result.data} role={ctx.role} />;
}
