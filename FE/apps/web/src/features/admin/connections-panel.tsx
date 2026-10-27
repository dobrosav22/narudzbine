"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckIcon, LinkIcon, SearchIcon, UnlinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatDateTime, isApiError, isFilledWithin, type Organization, type Relationship } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useGuarded } from "@/features/auth/reauth";
import { IdText, MutationError, REASON_MAX, ReasonDialog, ReasonField } from "./parts";
import { useAdminOrganizationNames, useAdminOrganizations, useConnect, useDisconnect } from "./queries";

/*
 * Direct administrative connection (adminConnectOrganizations) and disconnection
 * (adminDisconnect). The backend offers administrators no relationship list or read, so this
 * panel shows the relationships returned to this tab. Connecting an already-connected pair
 * changes nothing and returns the existing relationship, which can then be disconnected.
 */

export function ConnectionsPanel({ org }: { org: Organization }) {
  const t = useTranslations("admin.connections");
  const [touched, setTouched] = useState<Relationship[]>([]);
  const remember = (r: Relationship) => setTouched((list) => [r, ...list.filter((x) => x.id !== r.id)]);

  return (
    <div className="flex flex-col gap-4">
      <ConnectCard org={org} onResult={remember} />
      <Card>
        <CardHeader>
          <CardTitle>{t("resultsTitle")}</CardTitle>
          <CardDescription>{t("resultsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {touched.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <RelationshipsTable org={org} rows={touched} onChanged={remember} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectCard({ org, onResult }: { org: Organization; onResult: (r: Relationship) => void }) {
  const t = useTranslations("admin.connections");
  const ta = useTranslations("admin");
  const guarded = useGuarded();
  const connect = useConnect();
  const counterpartType = org.type === "VENDOR" ? "BUYER" : "VENDOR";
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Organization | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const candidates = useAdminOrganizations(
    { size: 10, page: 0, type: counterpartType, country: org.country, state: "ACTIVE", ...(search ? { q: search } : {}) },
    org.state === "ACTIVE",
  );

  if (org.state !== "ACTIVE") {
    return (
      <Alert>
        <AlertDescription>{t("inactive")}</AlertDescription>
      </Alert>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked || !isFilledWithin(reason, REASON_MAX) || connect.isPending) return;
    const body = org.type === "VENDOR" ? { vendorId: org.id, buyerId: picked.id, reason: reason.trim() } : { vendorId: picked.id, buyerId: org.id, reason: reason.trim() };
    try {
      const relationship = await guarded(() => connect.mutateAsync(body));
      onResult(relationship);
      toast.success(t("connected", { a: org.displayName, b: picked.displayName }));
      setReason("");
      setPicked(null);
    } catch {
      // Inline error.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{org.type === "VENDOR" ? t("connectBuyer") : t("connectVendor")}</CardTitle>
        <CardDescription>{t("connectDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="connect-search">{org.type === "VENDOR" ? t("findBuyer") : t("findVendor")}</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput id="connect-search" value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} placeholder={ta("organizations.search")} />
              </InputGroup>
            </Field>
            {candidates.isError ? (
              <ErrorState error={candidates.error} onRetry={() => void candidates.refetch()} />
            ) : candidates.isPending ? (
              <RowsSkeleton rows={2} />
            ) : candidates.data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border" role="listbox" aria-label={t("candidates")}>
                {candidates.data.items.map((c) => {
                  const selected = picked?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => setPicked(c)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${selected ? "bg-muted" : ""}`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{c.displayName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {c.legalName} · {c.registrationIdentifier}
                          </span>
                        </span>
                        {selected && <CheckIcon className="size-4 text-primary" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <ReasonField id="connect-reason" label={ta("reason")} hint={ta("reasonPrivateHint")} value={reason} onChange={setReason} />
          </FieldGroup>
          <MutationError error={connect.error} messages={{ PLAN_LIMIT_EXCEEDED: t("planLimit"), PLAN_REQUIRED: t("planRequired") }} />
          <div>
            <Button type="submit" disabled={!picked || !isFilledWithin(reason, REASON_MAX) || connect.isPending}>
              {connect.isPending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
              {picked ? t("connectWith", { name: picked.displayName }) : t("connect")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function RelationshipsTable({ org, rows, onChanged }: { org: Organization; rows: Relationship[]; onChanged: (r: Relationship) => void }) {
  const t = useTranslations("admin.connections");
  const guarded = useGuarded();
  const disconnect = useDisconnect();
  const [target, setTarget] = useState<Relationship | null>(null);
  const counterpartIds = rows.map((r) => (org.type === "VENDOR" ? r.buyerId : r.vendorId));
  const names = useAdminOrganizationNames(counterpartIds);

  async function confirm(reason: string) {
    if (!target) return;
    try {
      const updated = await guarded(() => disconnect.mutateAsync({ relationshipId: target.id, body: { expectedRevision: target.revision, reason } }));
      onChanged(updated);
      toast.success(t("disconnected"));
      disconnect.reset();
      setTarget(null);
    } catch (e) {
      if (isApiError(e, "REVISION_CONFLICT")) toast.error(t("staleRelationship"));
    }
  }

  return (
    <>
      <Table className="text-sm" aria-label={t("resultsTitle")}>
        <TableHeader>
          <TableRow>
            <TableHead>{org.type === "VENDOR" ? t("buyer") : t("vendor")}</TableHead>
            <TableHead>{t("state")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("since")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("id")}</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">{t("actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const otherId = org.type === "VENDOR" ? r.buyerId : r.vendorId;
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/admin/organizations/${otherId}`} className="font-medium hover:underline">
                    {names.get(otherId)?.displayName ?? t("organization")}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={r.state === "ACTIVE" ? "success" : "secondary"}>{t(`relationshipState.${r.state}`)}</Badge>
                  {r.disconnectedReason && <div className="text-xs text-muted-foreground">{r.disconnectedReason}</div>}
                </TableCell>
                <TableCell className="hidden md:table-cell">{formatDateTime(r.updatedAt)}</TableCell>
                <TableCell className="hidden lg:table-cell">
                  <IdText id={r.id} />
                </TableCell>
                <TableCell className="text-right">
                  {r.state === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => setTarget(r)}>
                      <UnlinkIcon data-icon="inline-start" />
                      {t("disconnect")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <ReasonDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) {
            disconnect.reset();
            setTarget(null);
          }
        }}
        title={t("disconnectTitle")}
        description={t("disconnectDescription")}
        reasonHint={t("disconnectReasonHint")}
        confirmLabel={t("disconnect")}
        destructive
        pending={disconnect.isPending}
        error={disconnect.error}
        errorMessages={{ REVISION_CONFLICT: t("staleRelationship") }}
        onConfirm={(reason) => void confirm(reason)}
      />
    </>
  );
}
