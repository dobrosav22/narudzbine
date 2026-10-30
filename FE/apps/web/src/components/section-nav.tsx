"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { tabsListVariants } from "@/components/ui/tabs";

export interface Section {
  href: string;
  label: string;
}

/**
 * Sub-pages of one area (Catalogue, Settings, Account) as links styled like shadcn's
 * TabsList. Links, not Radix Tabs: each section is its own URL. The first section is
 * the area's index and is active on every path not claimed by a later one. On narrow screens
 * the strip scrolls from its start, and the active section is scrolled into view.
 */
export function SectionNav({ label, sections }: { label: string; sections: Section[] }) {
  const pathname = usePathname();
  const later = sections.slice(1).find((s) => pathname.startsWith(s.href));
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>("[aria-current=page]");
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  return (
    // justify-start: a centred strip that overflows hides its first tabs out of scroll reach.
    <nav ref={nav} aria-label={label} className={cn(tabsListVariants(), "h-9 max-w-full justify-start overflow-x-auto pointer-coarse:h-12")}>
      {sections.map((s, i) => {
        const active = later ? later.href === s.href : i === 0;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-foreground",
              active && "bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30 dark:text-foreground",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Page title + optional subtitle + section nav, shared by the sectioned areas. */
export function SectionHeader({
  title,
  subtitle,
  nav,
  action,
}: {
  title: string;
  subtitle?: string;
  nav?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {nav}
    </>
  );
}
