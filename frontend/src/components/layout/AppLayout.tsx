import { useState } from "react";
import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="lg:pl-[232px]">
        <TopBar onMenu={() => setOpen(true)} />
        <main className="mx-auto max-w-[1520px] px-4 pt-5 pb-12 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
