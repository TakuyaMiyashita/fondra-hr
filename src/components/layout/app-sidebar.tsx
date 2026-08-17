'use client';

import {
  BarChart3,
  Bot,
  Building2,
  ClipboardList,
  FileText,
  Handshake,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

import type { Role } from '@/services/auth-context';

const mainNav = [
  { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard, minRole: 'viewer' as Role },
  { href: '/employees', label: '従業員', icon: Users, minRole: 'viewer' as Role },
  { href: '/departments', label: '組織図', icon: Building2, minRole: 'viewer' as Role },
  { href: '/skills', label: 'スキル', icon: Sparkles, minRole: 'viewer' as Role },
  { href: '/one-on-ones', label: '1on1', icon: Handshake, minRole: 'viewer' as Role },
  { href: '/evaluations', label: '評価', icon: ClipboardList, minRole: 'viewer' as Role },
];

const adminNav = [
  { href: '/ai-assistant', label: 'AI アシスタント', icon: Bot, minRole: 'viewer' as Role },
  { href: '/audit-logs', label: '監査ログ', icon: FileText, minRole: 'viewer' as Role },
  { href: '/settings', label: '設定', icon: Settings, minRole: 'admin' as Role },
];

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

interface AppSidebarProps {
  role: Role;
  orgName: string;
}

export function AppSidebar({ role, orgName }: AppSidebarProps) {
  const pathname = usePathname();
  const roleLevel = ROLE_HIERARCHY[role];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <BarChart3 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">TalentPulse</span>
                <span className="truncate text-xs text-muted-foreground">{orgName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav
                .filter((item) => roleLevel >= ROLE_HIERARCHY[item.minRole])
                .map((item) => (
                  <SidebarMenuItem key={item.href + item.label}>
                    <SidebarMenuButton isActive={pathname === item.href} render={<Link href={item.href} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>管理</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNav
                .filter((item) => roleLevel >= ROLE_HIERARCHY[item.minRole])
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={pathname === item.href} render={<Link href={item.href} />}>
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />
      <SidebarRail />
    </Sidebar>
  );
}
