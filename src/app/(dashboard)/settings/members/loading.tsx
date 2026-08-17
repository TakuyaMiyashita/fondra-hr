import { Skeleton } from '@/components/ui/skeleton';

export default function MembersLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2 border-b pb-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="mt-1 h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b pb-3 last:border-0">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
