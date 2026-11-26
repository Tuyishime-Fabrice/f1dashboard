import { teamColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

export function TeamSwatch({ teamRef, id, className }: { teamRef?: string | null; id?: number | null; className?: string }) {
  return <span className={cn("inline-block h-3 w-[3px] shrink-0 rounded-full", className)} style={{ background: teamColor(teamRef ?? null, id ?? null) }} />;
}

export function TeamLabel({ name, teamRef, id, className }: { name?: string | null; teamRef?: string | null; id?: number | null; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <TeamSwatch teamRef={teamRef} id={id} />
      <span className="truncate">{name ?? "—"}</span>
    </span>
  );
}
