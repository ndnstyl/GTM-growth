"use client";

import { useRef } from "react";

/** Remembers the element that had focus when a dialog or sheet opened (the opener) and returns focus there on close. */
export function useOpener(): { onOpenAutoFocus: (e: Event) => void; onCloseAutoFocus: (e: Event) => void } {
  const opener = useRef<Element | null>(null);
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement;
    },
    onCloseAutoFocus: (e: Event) => {
      const el = opener.current;
      if (el instanceof HTMLElement && el !== document.body && el.isConnected) {
        e.preventDefault();
        el.focus({ preventScroll: true });
      }
    },
  };
}
