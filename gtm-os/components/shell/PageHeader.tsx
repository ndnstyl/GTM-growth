import { ReactNode } from "react";

/** The one page header: 18px title, one-line subtitle, actions on the right. Every route uses it. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-[18px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-[var(--ink2)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
