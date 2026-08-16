import { FileText } from 'lucide-react';

export default function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">監査ログ</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">監査ログがまだありません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          データの変更が行われると、自動的にここに記録されます。
        </p>
      </div>
    </div>
  );
}
