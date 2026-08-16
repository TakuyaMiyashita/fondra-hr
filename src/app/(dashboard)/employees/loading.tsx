import { Skeleton } from '@/components/ui/skeleton';

export default function EmployeesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 max-w-sm" />
        <Skeleton className="h-9 w-[120px]" />
        <Skeleton className="h-9 w-[160px]" />
      </div>
      <div className="rounded-md border">
        <div className="border-b p-2">
          <div className="flex gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-20" />
            ))}
          </div>
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-2 last:border-0">
            <Skeleton className="h-4 w-16" />
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
