import Link from "next/link";
import type { ReactNode } from "react";

export function Section({ title, href, children }: { title: ReactNode; href?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {href ? (
          <Link href={href} className="text-xs text-accent hover:underline">
            See all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 rounded-md bg-surface-2" />
      ))}
    </div>
  );
}
