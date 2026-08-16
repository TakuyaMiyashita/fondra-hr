import { Users } from 'lucide-react';

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">従業員</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Users className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">従業員がまだ登録されていません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          最初の従業員を追加して、タレントマネジメントを始めましょう。
        </p>
      </div>
    </div>
  );
}
