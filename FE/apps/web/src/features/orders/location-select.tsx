"use client";

import type { Location } from "@repo/core";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

export function LocationSelect({
  locations,
  value,
  onChange,
  id,
  className,
}: {
  locations: Location[];
  value: string | undefined;
  onChange: (locationId: string) => void;
  id?: string;
  className?: string;
}) {
  const t = useTranslations("orders");
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} className={className ?? "w-full"} aria-label={t("deliveryLocation")}>
        <SelectValue placeholder={t("chooseLocation")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {locations.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
