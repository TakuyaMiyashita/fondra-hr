'use client';
'use no memo';

import { Loader2, Mail, Shield, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Role } from '@/services/auth-context';
import type { OrgMember, PendingInvitation } from '@/types/settings';

import {
  changeRoleAction,
  removeMemberAction,
  revokeInvitationAction,
} from '../actions';
import { InviteDialog } from './invite-dialog';

const ROLE_LABELS: Record<Role, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
  viewer: '閲覧者',
};

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
  viewer: 'outline',
};

interface Props {
  members: OrgMember[];
  invitations: PendingInvitation[];
  role: Role;
  currentUserId: string;
}

export function MembersClient({
  members,
  invitations,
  role,
  currentUserId,
}: Props) {
  const router = useRouter();
  const isAdmin = role === 'owner' || role === 'admin';
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgMember | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PendingInvitation | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(membershipId: string, newRole: string) {
    if (!newRole || newRole === '__none__') return;
    startTransition(async () => {
      const result = await changeRoleAction({ membershipId, role: newRole });
      if (result.success) {
        toast.success('ロールを変更しました');
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRemoveMember() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await removeMemberAction(deleteTarget.id);
      if (result.success) {
        toast.success('メンバーを削除しました');
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRevokeInvitation() {
    if (!revokeTarget) return;
    startTransition(async () => {
      const result = await revokeInvitationAction(revokeTarget.id);
      if (result.success) {
        toast.success('招待を取り消しました');
        setRevokeTarget(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">設定</h1>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button variant="ghost" size="sm" render={<Link href="/settings" />}>
          一般
        </Button>
        <Button variant="ghost" size="sm" className="font-semibold">
          メンバー
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>メンバー</CardTitle>
            <CardDescription>
              組織のメンバーとロールを管理します
            </CardDescription>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              招待
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>メールアドレス</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {m.email ?? '(不明)'}
                    {m.userId === currentUserId && (
                      <Badge variant="outline" className="text-xs">
                        自分
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin && m.role !== 'owner' && m.userId !== currentUserId ? (
                      <Select
                        value={m.role}
                        onValueChange={(val) => {
                          if (val) handleRoleChange(m.id, val);
                        }}
                        disabled={isPending}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">管理者</SelectItem>
                          <SelectItem value="member">メンバー</SelectItem>
                          <SelectItem value="viewer">閲覧者</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={ROLE_VARIANT[m.role]}>
                        <Shield className="mr-1 h-3 w-3" />
                        {ROLE_LABELS[m.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isAdmin &&
                      m.role !== 'owner' &&
                      m.userId !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(m)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {isAdmin && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>保留中の招待</CardTitle>
            <CardDescription>
              まだ承諾されていない招待の一覧です
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>メールアドレス</TableHead>
                  <TableHead>ロール</TableHead>
                  <TableHead>有効期限</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {inv.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[inv.role]}>
                        {ROLE_LABELS[inv.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(inv.expiresAt).toLocaleDateString('ja-JP')}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRevokeTarget(inv)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => {
          setInviteOpen(false);
          router.refresh();
        }}
      />

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>メンバーの削除</DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.email ?? ''}</strong>{' '}
              を組織から削除します。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onOpenChange={(v) => !v && setRevokeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>招待の取り消し</DialogTitle>
            <DialogDescription>
              <strong>{revokeTarget?.email ?? ''}</strong>{' '}
              への招待を取り消します。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeInvitation}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              取り消し
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
