"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteDealer } from "../../actions";
import { DealerFormDialog, type DealerFormValues } from "./dealer-form-dialog";

export function DealerRowActions({ dealer }: { dealer: DealerFormValues }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();

  // Deleting a dealer cascades its whole stock history, so require the name to be
  // typed rather than accepting a single mis-aimed click.
  const canDelete = confirmText.trim() === dealer.dealerName.trim();

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteDealer(dealer.id);
      if (result.ok) {
        toast.success(`Deleted ${dealer.dealerName}`);
        setDeleteOpen(false);
        setConfirmText("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={`Actions for ${dealer.dealerName}`}>
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          }
        />
        {/*
          onClick, not onSelect: Base UI's Menu.Item has no onSelect (that is Radix's
          name for it). React accepts `onSelect` as a DOM text-selection handler, so
          TypeScript stays quiet and the item silently does nothing when clicked.
        */}
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" aria-hidden />
            Delete dealer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DealerFormDialog dealer={dealer} open={editOpen} onOpenChange={setEditOpen} />

      <Dialog
        open={deleteOpen}
        onOpenChange={(next) => {
          setDeleteOpen(next);
          if (!next) setConfirmText("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this dealer?</DialogTitle>
            <DialogDescription>
              This removes <strong>{dealer.dealerName}</strong> from the public map along with
              its entire stock history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`confirm-${dealer.id}`}>
              Type the dealer name to confirm
            </Label>
            <Input
              id={`confirm-${dealer.id}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={dealer.dealerName}
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!canDelete || pending} onClick={confirmDelete}>
              {pending ? "Deleting…" : "Delete dealer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
