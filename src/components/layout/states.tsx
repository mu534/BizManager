import { ButtonLink } from "@components/ui/button";
import { Card, EmptyState, Skeleton } from "@components/ui/primitives";
import { IconAlert } from "@components/ui/icons";

/** Shown instead of a page when the member's role may not see it. */
export function AccessDenied({ businessId, what = "this page" }: { businessId: string; what?: string }) {
  return (
    <Card>
      <EmptyState
        icon={<IconAlert size={22} />}
        title="You don't have access to this"
        description={`Your role can't open ${what}. Ask the business owner or a manager if you need it.`}
        action={<ButtonLink href={`/app/${businessId}/dashboard`} variant="secondary">Back to dashboard</ButtonLink>}
      />
    </Card>
  );
}

/** Generic page-level loading state (used by loading.tsx files). */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-48" />
      <Skeleton className="mb-6 h-4 w-72" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 border-r border-line bg-surface lg:block" />
      <div className="flex-1 p-6"><PageSkeleton /></div>
    </div>
  );
}
