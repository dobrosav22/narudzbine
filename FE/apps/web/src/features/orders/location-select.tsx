"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Address, Location } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export function formatAddress(a: Address): string {
  return [a.line1, a.line2, `${a.postalCode} ${a.city}`].filter(Boolean).join(", ");
}

/** The buyer's own ACTIVE delivery locations as a radio list (management lives under Settings → Locations). */
export function LocationSelect({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value: string | null;
  onChange: (locationId: string) => void;
}) {
  const t = useTranslations("checkout");
  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-muted-foreground">{t("noLocations")}</p>
        <Button asChild size="sm" variant="outline">
          <Link href="/buyer/settings/locations">{t("manageLocations")}</Link>
        </Button>
      </div>
    );
  }
  return (
    <FieldSet>
      <FieldLegend className="sr-only">{t("deliveryLocation")}</FieldLegend>
      <RadioGroup value={value ?? ""} onValueChange={onChange}>
        {locations.map((l) => (
          <FieldLabel key={l.id} htmlFor={`loc-${l.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{l.name}</FieldTitle>
                <FieldDescription>{formatAddress(l.address)}</FieldDescription>
                {l.contact && <FieldDescription>{t("locationContact", { name: l.contact.name, phone: l.contact.phone })}</FieldDescription>}
              </FieldContent>
              <RadioGroupItem value={l.id} id={`loc-${l.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  );
}
