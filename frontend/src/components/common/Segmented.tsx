import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function Segmented<T extends string>({ value, onChange, options, size = "sm" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; size?: "sm" | "md" }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList className={size === "sm" ? "h-7" : undefined}>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} disabled={o.disabled} className={size === "sm" ? "h-6 px-2.5 text-xs" : undefined}>
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
