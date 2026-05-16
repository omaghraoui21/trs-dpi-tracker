/**
 * Toggle to show/hide inactive (deactivated) items in admin tables.
 */
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ShowInactiveToggleProps {
  showInactive: boolean;
  onChange: (value: boolean) => void;
  inactiveCount?: number;
}

export function ShowInactiveToggle({
  showInactive,
  onChange,
  inactiveCount,
}: ShowInactiveToggleProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch
        id="show-inactive"
        checked={showInactive}
        onCheckedChange={onChange}
        className="scale-75 origin-left"
      />
      <Label htmlFor="show-inactive" className="text-xs cursor-pointer">
        Afficher inactifs
        {inactiveCount !== undefined && inactiveCount > 0 ? ` (${inactiveCount})` : ""}
      </Label>
    </div>
  );
}
