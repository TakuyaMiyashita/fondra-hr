import { Sparkles } from 'lucide-react';

export default function SkillsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">スキル</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">スキルがまだ登録されていません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          スキルを定義して、従業員のスキルマトリクスを作成しましょう。
        </p>
      </div>
    </div>
  );
}
