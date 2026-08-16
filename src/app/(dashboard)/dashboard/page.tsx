import { getAuthContext } from '@/lib/auth';
import { getDashboardStats, getRecentActivity } from '@/services/dashboard';

import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const ctx = await getAuthContext();

  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(ctx),
    getRecentActivity(ctx),
  ]);

  return (
    <DashboardClient stats={stats} recentActivity={recentActivity} />
  );
}
