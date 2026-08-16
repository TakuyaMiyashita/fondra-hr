export type EmployeeStatus = 'active' | 'inactive' | 'retired';

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  fullNameKana: string | null;
  email: string | null;
  position: string | null;
  departmentId: string | null;
  departmentName: string | null;
  hiredOn: string | null;
  status: EmployeeStatus;
  avatarPath: string | null;
  createdAt: Date;
}

export interface EmployeeDetail extends Employee {
  birthDate: string | null;
  userId: string | null;
  updatedAt: Date;
}

export interface EmployeeSkillRow {
  id: string;
  skillId: string;
  skillName: string;
  skillCategory: string | null;
  level: number;
  certifiedAt: string | null;
}

export interface OneOnOneRow {
  id: string;
  heldOn: string;
  interviewerName: string;
  notes: string | null;
  aiSummary: string | null;
  moodScore: number | null;
}

export interface EvaluationRow {
  id: string;
  cycleName: string;
  evaluatorName: string;
  status: string;
  comment: string | null;
  createdAt: Date;
}

export interface EmployeeListResult {
  employees: Employee[];
  total: number;
}

export interface DepartmentOption {
  id: string;
  name: string;
}
