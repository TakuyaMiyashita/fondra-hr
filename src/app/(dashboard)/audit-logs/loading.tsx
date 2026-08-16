import { Skeleton } from '@/components/ui/skeleton';

export default function AuditLogsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-28" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
