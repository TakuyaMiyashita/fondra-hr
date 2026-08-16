import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2 border-b pb-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="rounded-lg border p-6 space-y-4">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-9 w-16" />
      </div>
    </div>
  );
}
