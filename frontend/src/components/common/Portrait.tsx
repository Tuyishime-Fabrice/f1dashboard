import { Info } from "lucide-react";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { teamColor } from "@/lib/colors";
import { isOwnerSupplied, sourceLabel, useImage, type ImageCredit, type ImageKind } from "@/lib/images";
import { cn } from "@/lib/utils";

/** Attribution chip shown on every sourced image. */
export function CreditBadge({ credit, className }: { credit: ImageCredit; className?: string }) {
  const owner = isOwnerSupplied(credit);
  const cls = cn("absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-black/45 text-white/90 hover:bg-black/70", className);
  const label = owner ? `Image credit: ${sourceLabel(credit)}` : `Image credit: ${credit.author}, ${credit.license}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {credit.source_url ? (
          <a href={credit.source_url} target="_blank" rel="noreferrer" aria-label={label} className={cls}>
            <Info className="size-2.5" />
          </a>
        ) : (
          <span tabIndex={0} role="img" aria-label={label} className={cls}>
            <Info className="size-2.5" />
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top">
        {owner ? (
          <div className="font-medium">{sourceLabel(credit)}</div>
        ) : (
          <>
            <div className="font-medium">{credit.author}</div>
            <div className="text-white/70">
              {credit.license} · {sourceLabel(credit)}
            </div>
          </>
        )}
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
  /** "contain" for diagrams such as circuit maps (no cropping). */
  fit?: "cover" | "contain";
}

/** Licensed image with a clean monogram fallback (never an unrelated photo). */
export function Portrait({ kind, refKey, alt, fallback, teamRef, className, rounded = "md", showCredit = true, objectPosition = "50% 22%", fit = "cover" }: PortraitProps) {
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
    <div className={cn("relative shrink-0 overflow-hidden", fit === "contain" ? "bg-white p-3" : "bg-[#eef0f2]", radius, className)}>
      <img src={credit.file} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("size-full", fit === "contain" ? "object-contain" : "object-cover")} style={{ objectPosition: fit === "contain" ? "50% 50%" : objectPosition }} />
      {showCredit && rounded !== "full" && <CreditBadge credit={credit} />}
    </div>
  );
}
