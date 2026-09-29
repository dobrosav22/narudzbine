"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  moveStatus,
  statusKeyFromLabel,
  statusListProblems,
  type OrderStatus,
  type VendorOrderStatusConfig,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormError } from "@/features/auth/form-error";
import { StatusTracker } from "@/features/orders/status-tracker";
import { useSaveStatusConfig, useStatusConfig } from "./queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/**
 * 03 → vendor "Order status configuration" (Settings). 01 §5: statuses are
 * per vendor, with a cancelled status always available. New orders start at
 * the first status.
 */
export function StatusSettings({ vendorOrgId }: { vendorOrgId: string }) {
  const config = useStatusConfig(vendorOrgId);
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  if (config.isPending) return <RowsSkeleton rows={5} />;
  // Remount with fresh data after a save so the draft re-initialises.
  return <Editor key={JSON.stringify(config.data.statuses)} vendorOrgId={vendorOrgId} config={config.data} />;
}

function Editor({ vendorOrgId, config }: { vendorOrgId: string; config: VendorOrderStatusConfig }) {
  const t = useTranslations("statusSettings");
  const tc = useTranslations("common");
  const tm = useMsg();
  const [draft, setDraft] = useState<OrderStatus[]>(config.statuses);
  const [newLabel, setNewLabel] = useState("");
  const save = useSaveStatusConfig(vendorOrgId);
  const problems = statusListProblems(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config.statuses);
  const patch = (i: number, p: Partial<OrderStatus>) =>
    setDraft((d) =>
      d.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...p };
        // A cancelled status is always final (matches the service).
        return next.isCancelled ? { ...next, isTerminal: true } : next;
      }),
    );

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    const status: OrderStatus = { key: statusKeyFromLabel(label, draft.map((s) => s.key)), label, isTerminal: false, isCancelled: false };
    // New working statuses go before the first final one, so they're part of the normal flow.
    const firstFinal = draft.findIndex((s) => s.isTerminal);
    setDraft((d) => (firstFinal < 0 ? [...d, status] : [...d.slice(0, firstFinal), status, ...d.slice(firstFinal)]));
    setNewLabel("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("order")}</TableHead>
                <TableHead>{t("name")}</TableHead>
                <TableHead className="w-24 text-center">{t("final")}</TableHead>
                <TableHead className="w-24 text-center">{t("cancelled")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{tc("remove")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {draft.map((s, i) => (
                <TableRow key={s.key}>
                  <TableCell>
                    <div className="flex">
                      <Button size="icon-sm" variant="ghost" aria-label={t("moveUp", { name: s.label })} disabled={i === 0} onClick={() => setDraft((d) => moveStatus(d, i, -1))}>
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("moveDown", { name: s.label })}
                        disabled={i === draft.length - 1}
                        onClick={() => setDraft((d) => moveStatus(d, i, 1))}
                      >
                        <ArrowDownIcon />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input aria-label={t("nameAria", { n: i + 1 })} value={s.label} onChange={(e) => patch(i, { label: e.target.value })} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={t("finalAria", { name: s.label })}
                      checked={s.isTerminal}
                      disabled={s.isCancelled}
                      onCheckedChange={(v) => patch(i, { isTerminal: v === true })}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      aria-label={t("cancelledAria", { name: s.label })}
                      checked={s.isCancelled}
                      onCheckedChange={(v) => patch(i, { isCancelled: v === true })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="icon-sm" variant="ghost" aria-label={t("removeAria", { name: s.label })} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field>
            <FieldLabel htmlFor="new-status" className="sr-only">
              {t("new")}
            </FieldLabel>
            <InputGroup className="max-w-sm">
              <InputGroupInput id="new-status" placeholder={t("newPlaceholder")} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" disabled={!newLabel.trim()}>
                  <PlusIcon data-icon="inline-start" />
                  {tc("add")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </form>

        {problems.length > 0 && (
          <Alert>
            <AlertTitle>{t("fixFirst")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {problems.map((p) => (
                  <li key={p.key}>{tm(p)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {/* e.g. removing a status that existing orders still use — only the service knows every order. */}
        {save.error && <FormError error={save.error} />}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("preview")}</span>
          {problems.length === 0 && draft[0] && (
            <StatusTracker config={{ vendorOrgId, statuses: draft }} statusKey={draft[0].key} />
          )}
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
          disabled={!dirty || problems.length > 0 || save.isPending}
          onClick={() => save.mutate(draft, { onSuccess: () => toast.success(t("saved")) })}
        >
          {save.isPending && <Spinner data-icon="inline-start" />}
          {t("save")}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => { setDraft(config.statuses); save.reset(); }}>
          {t("discard")}
        </Button>
      </CardFooter>
    </Card>
  );
}
