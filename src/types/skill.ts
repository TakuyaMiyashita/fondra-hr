export interface Skill {
  id: string;
  name: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillWithCount extends Skill {
  employeeCount: number;
}

export interface SkillListResult {
  skills: SkillWithCount[];
  total: number;
}

export interface SkillMatrixEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  departmentName: string | null;
}

export interface SkillMatrixCell {
  employeeId: string;
  skillId: string;
  level: number;
  certifiedAt: string | null;
}

export interface SkillMatrixData {
  employees: SkillMatrixEmployee[];
  skills: { id: string; name: string; category: string | null }[];
  cells: SkillMatrixCell[];
  categories: string[];
}
