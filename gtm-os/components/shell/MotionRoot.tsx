"use client";

import { useEffect } from "react";
import { startActivityGate } from "@/lib/motion";

/** Starts the activity gate: tab visibility plus on-screen detection for the hero iframe. Renders nothing. */
export function MotionRoot() {
  useEffect(() => {
    startActivityGate();
  }, []);
  return null;
}
