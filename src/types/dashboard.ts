export interface DashboardStats {
  employeeCount: number;
  departmentCount: number;
  skillCount: number;
  activeCycleCount: number;
}

export interface RecentActivity {
  id: string;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  createdAt: Date;
}

export interface DepartmentHeadcount {
  name: string;
  count: number;
}

export interface SkillCategoryCount {
  category: string;
  count: number;
}

export interface EmployeeStatusCount {
  status: string;
  count: number;
}
