import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props} />
  );
}

/**
 * Multi-line text placeholder. Renders `lines` skeleton rows with the
 * last row at `lastWidth` to mimic natural paragraph wrap.
 */
function SkeletonText({ lines = 3, lastWidth = '60%' }) {
  return (
    <span
      role="status"
      aria-label="콘텐츠 로딩 중"
      className="flex flex-col gap-2 flex-1"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={i === lines - 1 ? { width: lastWidth } : undefined}
        />
      ))}
    </span>
  );
}

export { Skeleton, SkeletonText }
