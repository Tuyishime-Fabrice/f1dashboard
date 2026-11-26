import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  loading?: boolean;
  empty?: ReactNode | false;
  error?: string | null;
  className?: string;
  contentClassName?: string;
  height?: number;
  children?: ReactNode;
}

/** Standard analytical card: title row, optional controls, body, footnote. */
export function Panel({ title, description, actions, footnote, loading, empty, error, className, contentClassName, height, children }: PanelProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader className="flex-wrap">
        <div className="min-w-0 flex-1 basis-[200px]">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 [&>*]:max-w-full">{actions}</div>}
      </CardHeader>
      <CardContent className={cn("flex-1", contentClassName)}>
        {error ? (
          <Notice height={height}>Could not load data: {error}</Notice>
        ) : loading ? (
          <Skeleton style={{ height: height ?? 240 }} className="w-full" />
        ) : empty ? (
          <Notice height={height}>{empty}</Notice>
        ) : (
          children
        )}
      </CardContent>
      {footnote && <div className="border-t border-border px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">{footnote}</div>}
    </Card>
  );
}

export function Notice({ children, height }: { children: ReactNode; height?: number }) {
  return (
    <div className="flex items-center justify-center rounded-sm border border-dashed border-border px-6 text-center text-xs text-muted-foreground" style={{ minHeight: height ?? 160 }}>
      <div className="max-w-sm leading-relaxed">{children}</div>
    </div>
  );
}
