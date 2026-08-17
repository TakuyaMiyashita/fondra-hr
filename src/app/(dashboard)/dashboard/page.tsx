import { getAuthContext } from '@/lib/auth';
import {
  getDashboardStats,
  getDepartmentHeadcounts,
  getEmployeeStatusCounts,
  getRecentActivity,
  getSkillCategoryCounts,
} from '@/services/dashboard';

import { DashboardClient } from './dashboard-client';

export default async function DashboardPage() {
  const ctx = await getAuthContext();

  const [stats, recentActivity, departmentHeadcounts, skillCategories, employeeStatuses] =
    await Promise.all([
      getDashboardStats(ctx),
      getRecentActivity(ctx),
      getDepartmentHeadcounts(ctx),
      getSkillCategoryCounts(ctx),
      getEmployeeStatusCounts(ctx),
    ]);

  return (
    <DashboardClient
      stats={stats}
      recentActivity={recentActivity}
      departmentHeadcounts={departmentHeadcounts}
      skillCategories={skillCategories}
      employeeStatuses={employeeStatuses}
    />
  );
}
