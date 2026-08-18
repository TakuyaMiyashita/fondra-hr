'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { switchOrg } from '@/app/(auth)/actions';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface Org {
  orgId: string;
  orgName: string;
  orgPlan: string;
}

interface OrgSwitcherProps {
  currentOrgId: string;
  orgs: Org[];
}

export function OrgSwitcher({ currentOrgId, orgs }: OrgSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const currentOrg = orgs.find((o) => o.orgId === currentOrgId);

  function handleSwitch(orgId: string) {
    if (orgId === currentOrgId) return;
    startTransition(async () => {
      // 成功時はサーバー側で redirect するため、戻り値が返るのは失敗時だけ。
      const result = await switchOrg({ orgId });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2" disabled={isPending}>
            <span className="max-w-[150px] truncate">{currentOrg?.orgName ?? '組織を選択'}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>組織を切り替え</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.orgId}
            onClick={() => handleSwitch(org.orgId)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="truncate">{org.orgName}</span>
              <Badge variant="secondary" className="text-[10px]">
                {org.orgPlan}
              </Badge>
            </div>
            {org.orgId === currentOrgId && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
