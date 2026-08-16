export type CycleStatus = 'draft' | 'in_progress' | 'completed';
export type EvalStatus = 'draft' | 'in_progress' | 'submitted' | 'confirmed' | 'returned';

export interface EvaluationCycle {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
  evaluationCount: number;
  createdAt: Date;
}

export interface EvaluationCycleDetail extends Omit<EvaluationCycle, 'evaluationCount'> {
  updatedAt: Date;
}

export interface Evaluation {
  id: string;
  cycleId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  evaluatorId: string;
  evaluatorName: string;
  ratings: Record<string, number> | null;
  comment: string | null;
  status: EvalStatus;
  createdAt: Date;
}

export interface CycleWithEvaluations {
  cycle: EvaluationCycleDetail;
  evaluations: Evaluation[];
}
