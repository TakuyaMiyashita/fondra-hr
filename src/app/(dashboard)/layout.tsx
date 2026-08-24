import { getAuthContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getUserMemberships } from '@/services/auth';

import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { TenantQueryBoundary } from '@/components/layout/tenant-query-boundary';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const memberships = await getUserMemberships(ctx.userId);
  const currentOrg = memberships.find((m) => m.orgId === ctx.orgId);

  const orgs = memberships.map((m) => ({
    orgId: m.orgId,
    orgName: m.orgName,
    orgPlan: m.orgPlan,
  }));

  return (
    <SidebarProvider>
      <AppSidebar role={ctx.role} orgName={currentOrg?.orgName ?? 'FondraHR'} />
      <SidebarInset>
        <AppHeader email={user?.email ?? ''} currentOrgId={ctx.orgId} orgs={orgs} />
        <main className="flex-1 p-6">
          <TenantQueryBoundary orgId={ctx.orgId}>{children}</TenantQueryBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
