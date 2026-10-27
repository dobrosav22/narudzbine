"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailIcon, StoreIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, formatDateTime, isOrgAdmin, type RelationshipState } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sessionStore, useBusiness } from "@/lib/session";
import { Pager, PartnerName } from "./parts";
import { useBuyerInvitations, useRelationships } from "./queries";

const PAGE_SIZE = 25;

/** Buyer → Vendors: the suppliers this business trades with (and used to), plus incoming invitations. */
export function BuyerVendorsScreen() {
  const t = useTranslations("trdVendors");
  const session = useBusiness();
  const [view, setView] = useState<RelationshipState>("ACTIVE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {isOrgAdmin(session) && <IncomingInvitations />}
      <Tabs value={view} onValueChange={(v) => setView(v as RelationshipState)}>
        <TabsList>
          <TabsTrigger value="ACTIVE">{t("tabs.active")}</TabsTrigger>
          <TabsTrigger value="DISCONNECTED">{t("tabs.disconnected")}</TabsTrigger>
        </TabsList>
        <TabsContent value="ACTIVE">
          <VendorTable state="ACTIVE" />
        </TabsContent>
        <TabsContent value="DISCONNECTED">
          <VendorTable state="DISCONNECTED" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Pending TRADING invitations addressed to this buyer. Accepting needs the emailed link (token)
 * opened by the exact invited owner/admin mailbox, so this only tells who should look for it.
 */
function IncomingInvitations() {
  const t = useTranslations("trdVendors.incoming");
  const invitations = useBuyerInvitations("PENDING");
  const incoming = (invitations.data ?? []).filter((i) => i.purpose === "TRADING");
  if (incoming.length === 0) return null;
  return (
    <Alert>
      <MailIcon />
      <AlertTitle>{t("title", { count: incoming.length })}</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {incoming.map((i) => (
            <li key={i.id}>{t("item", { email: i.recipientEmail, date: formatDateTime(i.expiresAt) })}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function VendorTable({ state }: { state: RelationshipState }) {
  const t = useTranslations("trdVendors");
  const router = useRouter();
  const session = useBusiness();
  const [page, setPage] = useState(0);
  const list = useRelationships({ state, page, size: PAGE_SIZE, includeTotal: true });

  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  if (list.isPending) return <RowsSkeleton />;
  if (list.data.items.length === 0) {
    return state === "ACTIVE" ? (
      <EmptyState icon={StoreIcon} title={t("emptyTitle")} description={t("emptyDescription")} />
    ) : (
      <EmptyState icon={StoreIcon} title={t("emptyDisconnectedTitle")} description={t("emptyDisconnectedDescription")} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>{t("vendor")}</TableHead>
              <TableHead>{state === "ACTIVE" ? t("connectedSince") : t("disconnectedOn")}</TableHead>
              {state === "ACTIVE" && (
                <TableHead className="text-right">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data.items.map((r) => {
              const href = `/buyer/vendors/${r.id}`;
              const isCurrent = session.activeVendorId === r.vendorId;
              return (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(href)}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        <PartnerName organizationId={r.vendorId} />
                      </Link>
                      {state === "ACTIVE" && isCurrent && <Badge variant="brand">{t("current")}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(state === "ACTIVE" ? r.createdAt : r.updatedAt)}</TableCell>
                  {state === "ACTIVE" && (
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          void sessionStore.selectVendor(r.vendorId).then(() => router.push("/buyer"));
                        }}
                      >
                        {t("browse")}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} size={PAGE_SIZE} total={list.data.total} itemCount={list.data.items.length} onPage={setPage} />
    </div>
  );
}
