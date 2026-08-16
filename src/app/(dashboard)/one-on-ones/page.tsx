import { Handshake } from 'lucide-react';

export default function OneOnOnesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">1on1</h1>
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Handshake className="h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">1on1記録がまだありません</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          1on1ミーティングを記録して、コミュニケーションの質を向上させましょう。
        </p>
      </div>
    </div>
  );
}
