import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'ログイン',
};

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl font-bold tracking-tight">
          FondraHR
          {/* 見出しの文言はページごとに違う必要がある（どのページに居るかを
              見出しだけで判別できるように）。ブランド名は見た目に残したいので、
              目的は読み上げ専用で足す。 */}
          <span className="sr-only">｜ログイン</span>
        </CardTitle>
        <CardDescription>アカウントにログイン</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <LoginForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
