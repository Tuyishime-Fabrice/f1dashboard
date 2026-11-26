import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FiltersProvider, useFilters } from "@/state/filters";

const Overview = lazy(() => import("@/pages/Overview"));
const Seasons = lazy(() => import("@/pages/Seasons"));
const Drivers = lazy(() => import("@/pages/Drivers"));
const Constructors = lazy(() => import("@/pages/Constructors"));
const RaceAnalysis = lazy(() => import("@/pages/RaceAnalysis"));
const Strategy = lazy(() => import("@/pages/Strategy"));
const History = lazy(() => import("@/pages/History"));
const About = lazy(() => import("@/pages/About"));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[86px]" />
        ))}
      </div>
      <Skeleton className="h-[360px]" />
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { ready } = useFilters();
  return ready ? <>{children}</> : <PageFallback />;
}

export default function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <FiltersProvider>
        <Routes>
          <Route element={<AppLayout />}>
            {[
              ["/", Overview],
              ["/seasons", Seasons],
              ["/drivers", Drivers],
              ["/constructors", Constructors],
              ["/races", RaceAnalysis],
              ["/strategy", Strategy],
              ["/history", History],
              ["/about", About],
            ].map(([path, Comp]) => {
              const C = Comp as React.ComponentType;
              return (
                <Route
                  key={path as string}
                  path={path as string}
                  element={
                    <Gate>
                      <Suspense fallback={<PageFallback />}>
                        <C />
                      </Suspense>
                    </Gate>
                  }
                />
              );
            })}
            <Route path="*" element={<div className="py-20 text-center text-muted-foreground">Page not found.</div>} />
          </Route>
        </Routes>
      </FiltersProvider>
    </TooltipProvider>
  );
}
