import { redirect } from 'next/navigation';

import { getOptionalUser } from '@/lib/auth';

import { LandingPage } from './landing-page';

export default async function Home() {
  const user = await getOptionalUser();

  if (user) {
    redirect('/dashboard');
  }

  return <LandingPage />;
}
