import { ClipboardList } from 'lucide-react';

export default function EvaluationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">評価</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">評価サイクルがまだ作成されていません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          評価サイクルを作成して、体系的な人事評価を開始しましょう。
        </p>
      </div>
    </div>
  );
}
