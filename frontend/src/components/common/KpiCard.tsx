import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface KpiProps {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  accent?: string; // left rule colour (e.g. team colour)
  media?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function KpiCard({ label, value, unit, sub, accent, media, loading, className }: KpiProps) {
  return (
    <Card className={cn("relative flex min-w-0 items-center gap-3 overflow-hidden px-4 py-3", className)}>
      {accent && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-sm" style={{ background: accent }} />}
      <div className="min-w-0 flex-1">
        <div className="label-caps truncate">{label}</div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="truncate font-display text-[28px] leading-none font-semibold tracking-tight tabular">{value}</span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        )}
        {sub && !loading && <div className="mt-1.5 truncate text-xs text-muted-foreground">{sub}</div>}
      </div>
      {media}
    </Card>
  );
}

/** Small stat used inside profile cards and comparison tables. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="label-caps truncate">{label}</div>
      <div className="mt-0.5 font-display text-xl leading-tight font-semibold tabular">{value}</div>
    </div>
  );
}
