import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">TalentPulse</CardTitle>
        <CardDescription>新しいアカウントを作成</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
