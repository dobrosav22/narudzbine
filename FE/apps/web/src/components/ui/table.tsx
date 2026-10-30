"use client"

import * as React from "react"
import { cn } from "cn"

// `stack`: below md, rows become wrapped blocks instead of a wide table. The header is hidden, so
// cells pass a `label`; the `primary` cell (usually the product or name) takes the full row.
// On wider screens `primary` takes the spare width and wraps only when it runs out.
// Class names are written out in full so Tailwind can find them.

function Table({
  className,
  stack = false,
  ...props
}: React.ComponentProps<"table"> & { stack?: boolean }) {
  return (
    <div
      data-slot="table-container"
      data-stack={stack || undefined}
      className="group/table relative w-full overflow-x-auto data-stack:max-md:overflow-x-visible"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm group-data-stack/table:max-md:block", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b group-data-stack/table:max-md:hidden", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0 group-data-stack/table:max-md:block", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0 group-data-stack/table:max-md:block",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted group-data-stack/table:max-md:flex group-data-stack/table:max-md:flex-wrap group-data-stack/table:max-md:items-center group-data-stack/table:max-md:gap-x-4 group-data-stack/table:max-md:gap-y-1 group-data-stack/table:max-md:py-2",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  primary = false,
  label,
  ...props
}: React.ComponentProps<"td"> & { primary?: boolean; label?: string }) {
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        "group-data-stack/table:max-md:block group-data-stack/table:max-md:px-2 group-data-stack/table:max-md:py-0.5 group-data-stack/table:max-md:text-left group-data-stack/table:max-md:whitespace-normal",
        // Long names and SKUs wrap instead of pushing the other columns out of view.
        primary && "w-full min-w-40 whitespace-normal [overflow-wrap:anywhere] group-data-stack/table:max-md:basis-full",
        label && "group-data-stack/table:max-md:before:mr-1.5 group-data-stack/table:max-md:before:text-xs group-data-stack/table:max-md:before:text-muted-foreground group-data-stack/table:max-md:before:content-[attr(data-label)]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
