import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getInvitationByToken } from '@/services/auth';

import { InviteAcceptForm } from './invite-accept-form';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InviteAcceptPage({ params }: Props) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">招待が無効です</CardTitle>
          <CardDescription>
            この招待リンクは期限切れか、既に使用されています。組織の管理者に新しい招待を依頼してください。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">組織への招待</CardTitle>
        <CardDescription>
          <strong>{invitation.orgName}</strong> に{invitation.role}として招待されています
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteAcceptForm
          invitationId={invitation.id}
          orgId={invitation.orgId}
          orgName={invitation.orgName}
          role={invitation.role}
          email={invitation.email}
          token={token}
        />
      </CardContent>
    </Card>
  );
}
