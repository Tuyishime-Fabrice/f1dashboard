import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { TeamSwatch } from "@/components/common/Team";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface PickerItem {
  id: number;
  label: string;
  short?: string;
  sub?: string;
  teamRef?: string | null;
  group?: string;
}

interface Props {
  items: PickerItem[];
  selected: number[];
  onChange: (ids: number[]) => void;
  placeholder: string;
  max?: number;
  multiple?: boolean;
  className?: string;
}

/** Searchable single/multi select for drivers, constructors and circuits. */
export function EntityPicker({ items, selected, onChange, placeholder, max = 4, multiple = true, className }: Props) {
  const [open, setOpen] = useState(false);
  const chosen = selected.map((id) => items.find((i) => i.id === id)).filter(Boolean) as PickerItem[];
  const groups = [...new Set(items.map((i) => i.group ?? ""))];

  const toggle = (id: number) => {
    if (!multiple) {
      onChange([id]);
      setOpen(false);
      return;
    }
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-8 max-w-full justify-between font-normal", className)} aria-label={placeholder}>
          <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {chosen.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {chosen.map((c) => (
              <span key={c.id} className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 text-xs">
                <TeamSwatch teamRef={c.teamRef} />
                {multiple ? (c.short ?? c.label) : c.label}
              </span>
            ))}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px]">
        <Command>
          <CommandInput placeholder="Search…" />
          {multiple && (
            <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span>
                {selected.length}/{max} selected
              </span>
              {selected.length > 0 && (
                <button className="inline-flex cursor-pointer items-center gap-1 hover:text-foreground" onClick={() => onChange([])}>
                  <X className="size-3" /> Clear
                </button>
              )}
            </div>
          )}
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g} heading={g || undefined}>
                {items
                  .filter((i) => (i.group ?? "") === g)
                  .map((i) => {
                    const on = selected.includes(i.id);
                    return (
                      <CommandItem key={i.id} value={`${i.label} ${i.short ?? ""} ${i.sub ?? ""} ${i.id}`} onSelect={() => toggle(i.id)} disabled={multiple && !on && selected.length >= max}>
                        <TeamSwatch teamRef={i.teamRef} />
                        <span className="min-w-0 flex-1 truncate">{i.label}</span>
                        {i.sub && <span className="shrink-0 text-[11px] text-muted-foreground">{i.sub}</span>}
                        <Check className={cn("size-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
