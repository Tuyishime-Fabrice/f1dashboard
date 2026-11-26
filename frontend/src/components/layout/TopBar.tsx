import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";

import { SeasonSelect } from "@/components/filters/SeasonSelect";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/format";
import { useFilters } from "@/state/filters";

import { NAV } from "./Sidebar";

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const { seasons } = useFilters();
  const page = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ?? (pathname.startsWith("/about") ? "Data & credits" : "");
  const latest = seasons[0];
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#f4f5f6]/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1520px] items-center gap-3 px-4 sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu className="size-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <span className="hidden font-display text-[15px] font-bold tracking-[0.08em] sm:inline">PITWALL</span>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <span className="truncate font-medium">{page}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {latest && (
            <span className="hidden text-xs text-muted-foreground md:inline">
              Data through {fmt.date(latest.last_date)}
            </span>
          )}
          <SeasonSelect />
        </div>
      </div>
    </header>
  );
}
