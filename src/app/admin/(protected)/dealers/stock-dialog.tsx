"use client";

import { useState, useTransition } from "react";
import { Boxes } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_PRESENTATION, deriveStatus } from "@/lib/stock";
import { updateStock } from "../../actions";

export function StockDialog({
  dealerId,
  dealerName,
  currentQuantity,
}: {
  dealerId: string;
  dealerName: string;
  currentQuantity: number;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(currentQuantity));
  const [pending, startTransition] = useTransition();

  const parsed = Number(quantity);
  const isValid = Number.isInteger(parsed) && parsed >= 0;
  // Show the resulting marker colour before saving, so the thresholds are not a
  // mystery to whoever is typing.
  const preview = isValid ? STATUS_PRESENTATION[deriveStatus(parsed)] : null;

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await updateStock(formData);
      if (result.ok) {
        toast.success(`${dealerName}: stock set to ${parsed}`);
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuantity(String(currentQuantity));
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Boxes className="size-3.5" aria-hidden />
            Stock
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cylinders delivered today</DialogTitle>
          <DialogDescription>
            {dealerName} — resets to zero at midnight.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <input type="hidden" name="dealerId" value={dealerId} />

          <div className="flex items-center gap-4">
            <div className="flex-1 rounded-lg border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-2xl font-bold tabular-nums">{currentQuantity}</p>
            </div>
            <span className="text-muted-foreground" aria-hidden>
              →
            </span>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="newQuantity">New count</Label>
              <Input
                id="newQuantity"
                name="newQuantity"
                type="number"
                min={0}
                step={1}
                required
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="text-lg font-semibold tabular-nums"
              />
            </div>
          </div>

          {preview ? (
            <p className="text-sm text-muted-foreground">
              Will show as{" "}
              <span className="font-medium text-foreground">
                {preview.dot} {preview.label}
              </span>{" "}
              on the public map.
            </p>
          ) : (
            <p className="text-sm text-red-600">Enter a whole number of 0 or more.</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !isValid}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
