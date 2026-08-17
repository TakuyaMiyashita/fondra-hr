import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getOptionalUser } from '@/lib/auth';

import { LandingPage } from './landing-page';

export const metadata: Metadata = {
  title: 'TalentPulse — タレントマネジメント SaaS',
};

export default async function Home() {
  const user = await getOptionalUser();

  if (user) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
