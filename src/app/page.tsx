import { redirect } from 'next/navigation';

import { getOptionalUser } from '@/lib/auth';

export default async function Home() {
  const user = await getOptionalUser();

  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
