"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
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
import { Textarea } from "@/components/ui/textarea";
import { dealerSchema } from "@/lib/validations";
import { createDealer, updateDealer } from "../../actions";

const LocationPicker = dynamic(() => import("@/components/map/location-picker"), {
  ssr: false,
  // Leaflet touches `window` at import time, so it can never be server-rendered.
  loading: () => (
    <div className="grid size-full place-items-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

export type DealerFormValues = {
  id: string;
  dealerName: string;
  address: string | null;
  district: string | null;
  municipality: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

export function DealerFormDialog({
  trigger,
  dealer,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactElement;
  dealer?: DealerFormValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [latitude, setLatitude] = useState(dealer?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(dealer?.longitude?.toString() ?? "");

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen;

  const isEdit = Boolean(dealer);

  function submit(formData: FormData) {
    // Same Zod schema the Server Action re-parses — this copy only saves a round
    // trip, it is not the security boundary.
    const parsed = dealerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const result = dealer
        ? await updateDealer(dealer.id, formData)
        : await createDealer(formData);

      if (result.ok) {
        toast.success(isEdit ? "Dealer updated" : "Dealer added");
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit dealer" : "Add dealer"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Stock is changed separately so every change is recorded in the audit log."
              : "New dealers start at zero cylinders."}
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dealerName">Dealer name *</Label>
            <Input
              id="dealerName"
              name="dealerName"
              required
              defaultValue={dealer?.dealerName ?? ""}
              placeholder="e.g. Karki Suppler"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="municipality">Municipality</Label>
              <Input
                id="municipality"
                name="municipality"
                defaultValue={dealer?.municipality ?? ""}
                placeholder="Biratnagar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Input
                id="district"
                name="district"
                defaultValue={dealer?.district ?? ""}
                placeholder="Morang"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" defaultValue={dealer?.address ?? ""} />
          </div>

          <div className="space-y-2">
            <Label>Location</Label>
            <div className="h-56 overflow-hidden rounded-md border">
              <LocationPicker
                value={
                  latitude && longitude
                    ? { lat: Number(latitude), lng: Number(longitude) }
                    : null
                }
                onChange={(lat, lng) => {
                  setLatitude(lat.toFixed(6));
                  setLongitude(lng.toFixed(6));
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitude *</Label>
              <Input
                id="latitude"
                name="latitude"
                type="number"
                step="any"
                required
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="26.4525"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitude *</Label>
              <Input
                id="longitude"
                name="longitude"
                type="number"
                step="any"
                required
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="87.2718"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Click or drag the pin on the map, or type coordinates directly. Must fall
            inside Nepal.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                inputMode="tel"
                defaultValue={dealer?.phone ?? ""}
                placeholder="98XXXXXXXX"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" defaultValue={dealer?.email ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={dealer?.notes ?? ""}
              placeholder="Not shown on the public site."
            />
          </div>

          {error ? (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add dealer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
