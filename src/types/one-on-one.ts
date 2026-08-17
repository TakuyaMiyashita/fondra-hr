export interface OneOnOne {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  interviewerId: string;
  interviewerName: string;
  heldOn: string;
  notes: string | null;
  aiSummary: string | null;
  moodScore: number | null;
  createdAt: Date;
}

export interface OneOnOneDetail extends OneOnOne {
  updatedAt: Date;
}

export interface OneOnOneListResult {
  records: OneOnOne[];
  total: number;
}

export type { EmployeeOption } from '@/types/employee';
