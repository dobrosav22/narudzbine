"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

/**
 * −/+ quantity input. Never goes below `min` (the product's minimum order).
 * While typing, the text lives in a local draft and is committed on blur/Enter,
 * so partial input isn't clamped mid-typing.
 */
export function QuantityStepper({
  value,
  min,
  onChange,
  label,
  className,
}: {
  value: number;
  min: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
}) {
  const t = useTranslations("catalogue");
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Math.floor(Number(draft));
    const next = Number.isFinite(n) && n >= min ? n : min;
    setDraft(null);
    if (next !== value) onChange(next);
  };

  return (
    <InputGroup className={className ?? "w-32"}>
      <InputGroupAddon>
        <InputGroupButton
          size="icon-xs"
          aria-label={t("decrease", { label })}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          <MinusIcon />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        inputMode="numeric"
        aria-label={label}
        className="text-center font-mono tabular-nums"
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={t("increase", { label })} onClick={() => onChange(value + 1)}>
          <PlusIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
