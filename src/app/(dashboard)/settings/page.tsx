import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">設定</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Settings className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">組織設定</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          組織名やメンバー管理などの設定は今後のフェーズで実装されます。
        </p>
      </div>
    </div>
  );
}
