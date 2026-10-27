"use client";

import { useState } from "react";
import Image from "next/image";
import { PackageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "cn";

/**
 * A product's picture (a READY media asset's content URL), or a neutral placeholder when there
 * is none or it fails to load. `unoptimized`: the content route needs the session cookie and the
 * API host differs per environment, so the Next image optimizer must not fetch it server-side.
 * Size and shape come from `className` (e.g. "size-10" or "aspect-[4/3] w-full").
 */
export function ProductImage({
  src,
  alt = "",
  className,
  sizes = "96px",
}: {
  src: string | undefined;
  /** Empty (decorative) by default: the product name sits right next to it almost everywhere. */
  alt?: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <div data-slot="product-image" className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted", className)}>
      {/* Keyed by src so a new image gets a fresh load/error state. */}
      <Picture key={src ?? "none"} src={src} alt={alt} sizes={sizes} />
    </div>
  );
}

function Picture({ src, alt, sizes }: { src: string | undefined; alt: string; sizes: string }) {
  const t = useTranslations("common");
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex size-full items-center justify-center text-muted-foreground/60" role={alt ? "img" : undefined} aria-label={alt ? t("noPicture", { name: alt }) : undefined}>
        <PackageIcon className="size-1/3 max-h-12 max-w-12" aria-hidden />
      </div>
    );
  }
  return <Image src={src} alt={alt} fill unoptimized sizes={sizes} className="object-cover" onError={() => setFailed(true)} />;
}
