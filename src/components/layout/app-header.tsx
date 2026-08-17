import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';

import { OrgSwitcher } from './org-switcher';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

interface Org {
  orgId: string;
  orgName: string;
  orgPlan: string;
}

interface AppHeaderProps {
  email: string;
  currentOrgId: string;
  orgs: Org[];
}

export function AppHeader({ email, currentOrgId, orgs }: AppHeaderProps) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <OrgSwitcher currentOrgId={currentOrgId} orgs={orgs} />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <UserMenu email={email} />
      </div>
    </header>
  );
}
