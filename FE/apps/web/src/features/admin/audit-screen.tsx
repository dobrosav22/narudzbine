"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HistoryIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { auditResourceKind, formatDateTime, normalizeResourceId, type AdminAuditQuery, type AuditEvent } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminSession } from "@/lib/session";
import { IdText, PageHeader } from "./parts";
import { useAdminAudit } from "./queries";

const RESOURCE_HREF: Record<NonNullable<ReturnType<typeof auditResourceKind>>, (id: string) => string> = {
  recoveryCase: (id) => `/admin/recovery-cases/${id}`,
  privacyCase: (id) => `/admin/privacy-cases/${id}`,
  invitation: (id) => `/admin/invitations/${id}`,
  organization: (id) => `/admin/organizations/${id}`,
};

/**
 * Platform audit metadata (adminListAudit): operational/security events across both countries.
 * Reasons are always null here by design; reason text lives only in case/support records.
 */
export function AdminAuditScreen() {
  const t = useTranslations("admin.audit");
  const ta = useTranslations("admin");
  const { account } = useAdminSession();
  const [orgInput, setOrgInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [filter, setFilter] = useState<AdminAuditQuery>({ size: 50 });
  const [orgInvalid, setOrgInvalid] = useState(false);
  const audit = useAdminAudit(filter);
  const rows = audit.data?.pages.flatMap((p) => p.items) ?? [];

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const org = orgInput.trim() ? normalizeResourceId(orgInput) : null;
    setOrgInvalid(Boolean(orgInput.trim()) && !org);
    if (orgInput.trim() && !org) return;
    const action = actionInput.trim().toUpperCase();
    setFilter({ size: 50, ...(org ? { organizationId: org } : {}), ...(action ? { action } : {}) });
  }

  const actor = (e: AuditEvent) => (e.actorAccountId === null ? t("system") : e.actorAccountId === account.id ? t("you") : <IdText id={e.actorAccountId} />);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form onSubmit={apply} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field className="sm:w-96">
          <FieldLabel htmlFor="audit-org">{t("organizationFilter")}</FieldLabel>
          <Input id="audit-org" value={orgInput} onChange={(e) => setOrgInput(e.target.value)} placeholder={ta("idPlaceholder")} aria-invalid={orgInvalid} />
          {orgInvalid && <FieldDescription className="text-destructive">{ta("invalidId")}</FieldDescription>}
        </Field>
        <Field className="sm:w-64">
          <FieldLabel htmlFor="audit-action">{t("actionFilter")}</FieldLabel>
          <Input id="audit-action" value={actionInput} maxLength={80} onChange={(e) => setActionInput(e.target.value)} placeholder="SETUP_INVITED" className="font-mono" />
        </Field>
        <Button type="submit" variant="outline">
          <SearchIcon data-icon="inline-start" />
          {t("apply")}
        </Button>
      </form>

      {audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.isPending ? (
        <RowsSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState icon={HistoryIcon} title={t("none")} />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Table className="text-sm" aria-label={t("title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("time")}</TableHead>
                  <TableHead>{t("action")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("actor")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("resource")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{t("fields")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const kind = auditResourceKind(e.action);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{e.action}</TableCell>
                      <TableCell className="hidden md:table-cell">{actor(e)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {e.resourceId ? (
                          kind ? (
                            <Link href={RESOURCE_HREF[kind](e.resourceId)} className="font-mono text-xs hover:underline">
                              {e.resourceId}
                            </Link>
                          ) : (
                            <IdText id={e.resourceId} />
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell max-w-64 text-xs whitespace-normal text-muted-foreground">{e.changedFields.join(", ") || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {audit.hasNextPage && (
              <div>
                <Button variant="outline" size="sm" disabled={audit.isFetchingNextPage} onClick={() => void audit.fetchNextPage()}>
                  {audit.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                  {t("more")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <CaseLookupCard />
    </div>
  );
}

/** Open a recovery case, privacy case or setup invitation by id (ids come from audit rows or operators). */
function CaseLookupCard() {
  const t = useTranslations("admin.audit");
  const ta = useTranslations("admin");
  const router = useRouter();
  const [kind, setKind] = useState<"recovery" | "privacy" | "invitation">("recovery");
  const [input, setInput] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("lookupTitle")}</CardTitle>
        <CardDescription>{t("lookupDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const id = normalizeResourceId(input);
            setInvalid(!id);
            if (!id) return;
            router.push(kind === "recovery" ? `/admin/recovery-cases/${id}` : kind === "privacy" ? `/admin/privacy-cases/${id}` : `/admin/invitations/${id}`);
          }}
        >
          <Field className="sm:w-56">
            <FieldLabel htmlFor="lookup-kind">{t("lookupKind")}</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger id="lookup-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="recovery">{t("kindRecovery")}</SelectItem>
                  <SelectItem value="privacy">{t("kindPrivacy")}</SelectItem>
                  <SelectItem value="invitation">{t("kindInvitation")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="flex-1">
            <FieldLabel htmlFor="lookup-id">{t("lookupId")}</FieldLabel>
            <Input id="lookup-id" value={input} onChange={(e) => setInput(e.target.value)} placeholder={ta("idPlaceholder")} aria-invalid={invalid} />
            {invalid && <FieldDescription className="text-destructive">{ta("invalidId")}</FieldDescription>}
          </Field>
          <Button type="submit" variant="outline">
            {ta("open")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
