import {
  BarChart3,
  Building2,
  ClipboardList,
  Handshake,
  Lock,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { ButtonLink } from '@/components/shared/button-link';

const features = [
  {
    icon: Users,
    title: '従業員管理',
    description: '社員情報を一元管理。部署・役職・ステータスをリアルタイムに把握',
  },
  {
    icon: Building2,
    title: '組織図',
    description: 'ツリー構造で組織全体を可視化。ドラッグ&ドロップで組織改編',
  },
  {
    icon: Sparkles,
    title: 'スキル管理',
    description: 'スキルマトリクスで人材の強み・育成ポイントを一目で把握',
  },
  {
    icon: Handshake,
    title: '1on1記録',
    description: '面談記録をデジタル化。コンディションの推移を可視化',
  },
  {
    icon: ClipboardList,
    title: '評価管理',
    description: '評価サイクルの作成・管理。複数項目の評価を効率的に実施',
  },
  {
    icon: Lock,
    title: 'セキュリティ',
    description: 'マルチテナント分離・ロール別権限・操作ログで企業データを保護',
  },
];

export function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
              <BarChart3 className="size-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">FondraHR</span>
          </Link>
          <div className="flex items-center gap-3">
            <ButtonLink variant="ghost" size="sm" href="/login">
              ログイン
            </ButtonLink>
            <ButtonLink size="sm" href="/signup">
              無料で始める
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-20 text-center">
          <h1 className="mx-auto max-w-2xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
            人材マネジメントを、
            <br />
            シンプルに。
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-lg text-lg">
            従業員情報・スキル・1on1・評価を一つのプラットフォームで管理。
            中小〜中堅企業のHR部門・マネージャーのための タレントマネジメントSaaS。
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <ButtonLink size="lg" href="/signup">
              無料で始める
            </ButtonLink>
            <ButtonLink variant="outline" size="lg" href="/login">
              ログイン
            </ButtonLink>
          </div>
        </section>

        <section className="bg-muted/30 border-t py-20">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight">
              必要な機能を、すべて一箇所に
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md text-center">
              人材管理に必要な機能をモダンなUIで提供します
            </p>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-card hover:border-primary/30 rounded-lg border p-6 transition-colors"
                >
                  <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
                    <f.icon className="size-5" />
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight">今すぐ始めましょう</h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-md">
              アカウントを作成するだけで、すべての機能を無料でお試しいただけます
            </p>
            <ButtonLink size="lg" className="mt-8" href="/signup">
              無料で始める
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className="text-muted-foreground border-t py-8 text-center text-sm">
        <p>&copy; {new Date().getFullYear()} FondraHR. All rights reserved.</p>
      </footer>
    </div>
  );
}
