import { Info } from "lucide-react";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { teamColor } from "@/lib/colors";
import { useImage, type ImageCredit, type ImageKind } from "@/lib/images";
import { cn } from "@/lib/utils";

/** Attribution chip shown on every sourced image. */
export function CreditBadge({ credit, className }: { credit: ImageCredit; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={credit.source_url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Image credit: ${credit.author}, ${credit.license}`}
          className={cn("absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-black/45 text-white/90 hover:bg-black/70", className)}
        >
          <Info className="size-2.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="font-medium">{credit.author}</div>
        <div className="text-white/70">
          {credit.license} · Wikimedia Commons
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface PortraitProps {
  kind: ImageKind;
  refKey: string | null | undefined;
  alt: string;
  fallback: string; // initials / code
  teamRef?: string | null;
  className?: string;
  rounded?: "full" | "md";
  showCredit?: boolean;
  objectPosition?: string;
}

/** Licensed image with a clean monogram fallback (never an unrelated photo). */
export function Portrait({ kind, refKey, alt, fallback, teamRef, className, rounded = "md", showCredit = true, objectPosition = "50% 22%" }: PortraitProps) {
  const credit = useImage(kind, refKey);
  const [failed, setFailed] = useState(false);
  const color = teamColor(teamRef ?? null);
  const radius = rounded === "full" ? "rounded-full" : "rounded-md";
  if (!credit || failed) {
    return (
      <div
        className={cn("flex shrink-0 items-center justify-center bg-[#eef0f2] font-display font-semibold tracking-wide text-[#5b6168]", radius, className)}
        style={{ boxShadow: teamRef ? `inset 0 -3px 0 ${color}` : undefined }}
        aria-label={alt}
      >
        {fallback}
      </div>
    );
  }
  return (
    <div className={cn("relative shrink-0 overflow-hidden bg-[#eef0f2]", radius, className)}>
      <img src={credit.file} alt={alt} loading="lazy" onError={() => setFailed(true)} className="size-full object-cover" style={{ objectPosition }} />
      {showCredit && rounded !== "full" && <CreditBadge credit={credit} />}
    </div>
  );
}
