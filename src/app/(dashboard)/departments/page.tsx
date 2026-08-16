import { Building2 } from 'lucide-react';

export default function DepartmentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">組織図</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">部署がまだ登録されていません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          部署を追加して組織構造を構築しましょう。
        </p>
      </div>
    </div>
  );
}
