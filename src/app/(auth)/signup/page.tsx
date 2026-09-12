import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'アカウント作成',
};

export default function SignupPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle role="heading" aria-level={1} className="text-2xl font-bold tracking-tight">
          FondraHR
          <span className="sr-only">｜アカウント作成</span>
        </CardTitle>
        <CardDescription>新しいアカウントを作成</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
