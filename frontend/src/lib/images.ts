import { useQuery } from "@tanstack/react-query";

export interface ImageCredit {
  file: string;
  title: string;
  source_url: string;
  image_url: string;
  author: string;
  credit: string | null;
  license: string;
  license_url: string | null;
  attribution_required: boolean;
  wikipedia_article: string | null;
  method: string;
  retrieved: string;
}

export type ImageKind = "drivers" | "constructors" | "circuits" | "hero";

export interface CreditsFile {
  drivers?: Record<string, ImageCredit>;
  constructors?: Record<string, ImageCredit>;
  circuits?: Record<string, ImageCredit>;
  hero?: Record<string, ImageCredit>;
  _meta?: { generated: string; source: string; policy: string };
}

/** Image credits written by scripts/fetch_images.py (empty when not yet run). */
export function useCredits() {
  return useQuery<CreditsFile>({
    queryKey: ["image-credits"],
    queryFn: async () => {
      const res = await fetch("/images/credits.json");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: Infinity,
  });
}

export function useImage(kind: ImageKind, ref: string | null | undefined): ImageCredit | undefined {
  const { data } = useCredits();
  if (!ref || !data) return undefined;
  return data[kind]?.[ref];
}
