import { CalendarRange, CircleGauge, Flag, Info, LayoutDashboard, Landmark, ShieldHalf, UserRound, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

export const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/seasons", label: "Seasons", icon: CalendarRange },
  { to: "/drivers", label: "Drivers", icon: UserRound },
  { to: "/constructors", label: "Constructors", icon: ShieldHalf },
  { to: "/races", label: "Race Analysis", icon: Flag },
  { to: "/strategy", label: "Strategy & Weather", icon: CircleGauge },
  { to: "/history", label: "History", icon: Landmark },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="6" fill="#23262a" />
        <path d="M8 22 L14 10 H24 L22.5 13 H16 L15 15 H21 L19.5 18 H13.5 L11.5 22 Z" fill="#E10600" />
      </svg>
      <div className="leading-none">
        <div className="font-display text-[19px] font-bold tracking-[0.08em] text-white">PITWALL</div>
        <div className="mt-0.5 text-[10px] tracking-[0.12em] text-sidebar-muted uppercase">Formula 1 Analytics</div>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { search } = useLocation();
  const season = new URLSearchParams(search).get("season");
  const keep = season ? `?season=${season}` : "";
  return (
    <>
      <div className={cn("fixed inset-0 z-30 bg-black/40 lg:hidden", open ? "block" : "hidden")} onClick={onClose} />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <button className="cursor-pointer text-sidebar-muted hover:text-white lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-4" />
          </button>
        </div>
        <nav className="mt-3 flex flex-col gap-0.5 px-3" aria-label="Main">
          <div className="px-2.5 pb-2 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted uppercase">Analytics</div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to + keep}
              end={to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                  isActive ? "bg-white/[0.07] text-white" : "text-sidebar-foreground/80 hover:bg-white/[0.04] hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn("absolute top-2 bottom-2 left-0 w-[2px] rounded-full", isActive ? "bg-racing" : "bg-transparent")} />
                  <Icon className={cn("size-4", isActive ? "text-white" : "text-sidebar-muted group-hover:text-white")} strokeWidth={1.75} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-3 py-3">
          <NavLink
            to={"/about" + keep}
            onClick={onClose}
            className={({ isActive }) =>
              cn("flex h-8 items-center gap-3 rounded-md px-2.5 text-[12px]", isActive ? "bg-white/[0.07] text-white" : "text-sidebar-muted hover:text-white")
            }
          >
            <Info className="size-3.5" strokeWidth={1.75} /> Data, methods & credits
          </NavLink>
        </div>
      </aside>
    </>
  );
}
