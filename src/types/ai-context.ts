/** AI アシスタントに渡す組織サマリ。個人を特定しない集計値だけを含む。 */
export interface OrgSummary {
  orgName: string;
  employeeCount: number;
  departmentCount: number;
  skillCount: number;
  cycleCount: number;
  oneOnOneCount: number;
  departments: { name: string; memberCount: number }[];
}
