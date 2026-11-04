"use client";

import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header: string;
  message: React.ReactNode;
  acceptLabel: string;
  rejectLabel: string;
  /** Style the accept action as destructive. */
  destructive?: boolean;
  onAccept: () => void;
};

/** Controlled AlertDialog confirm (replaces PrimeReact confirmDialog()). */
function ConfirmDialog({
  open,
  onOpenChange,
  header,
  message,
  acceptLabel,
  rejectLabel,
  destructive = false,
  onAccept,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-edge bg-panel text-fog">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-2xl text-fog">
            {header}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-dim">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{rejectLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={onAccept}
          >
            {acceptLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
