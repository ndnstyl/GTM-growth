import React from "react";
import { DialogProvider } from "./Dialogs";
import GtmHeader from "./Header";

/** The header with its dialogs, for every page that is not the home page (blog, legal, classroom and the rest). */
export default function GtmChrome() {
  return (
    <DialogProvider>
      <GtmHeader />
    </DialogProvider>
  );
}
