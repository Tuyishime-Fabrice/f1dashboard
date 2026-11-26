import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function PageHeader({ title, subtitle, inProgress, children }: { title: string; subtitle?: ReactNode; inProgress?: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-[26px] leading-none font-semibold tracking-tight uppercase">{title}</h1>
          {inProgress && (
            <Badge variant="live">
              <span className="size-1.5 rounded-full bg-racing" /> Season in progress
            </Badge>
          )}
        </div>
        {subtitle && <p className="mt-1.5 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <h2 className="label-caps text-foreground">{children}</h2>
      {aside}
    </div>
  );
}
