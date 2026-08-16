export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[];
  employeeCount: number;
}
