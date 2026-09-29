import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Season } from "@/lib/seasons";

/** Plain GET form so it works without JavaScript. Keeps other query params via `keep`. */
export function SeasonPicker({ seasons, selectedId, keep = {} }: { seasons: Season[]; selectedId: string; keep?: Record<string, string> }) {
  if (seasons.length < 2) return null;
  return (
    <form method="get" className="flex items-end gap-2">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="season">Season</Label>
        <Select id="season" name="season" defaultValue={selectedId} className="w-52">
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (current)" : " (archived)"}</option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="secondary">Show</Button>
    </form>
  );
}
