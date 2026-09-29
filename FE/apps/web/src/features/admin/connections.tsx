"use client";

import { useState } from "react";
import Link from "next/link";
import { LinkIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";
import { formatDate, type VendorBuyerRelation } from "@repo/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLink, useUnlink } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

export interface ConnectionRow {
  relation: VendorBuyerRelation;
  /** The org on the other side of the relation. */
  other: { id: string; name: string; href: string };
}

/**
 * Connected orgs with Unlink, plus a picker to Link another (01 §9/§10). Both reuse the
 * VendorBuyerRelation the invite flow creates; used from vendor detail and buyer detail.
 */
export function ConnectionsCard({
  title,
  description,
  side,
  selfId,
  selfName,
  rows,
  candidates,
  linkHint,
}: {
  title: string;
  description: string;
  /** Which side this card is on: "vendor" lists buyers, "buyer" lists vendors. */
  side: "vendor" | "buyer";
  selfId: string;
  selfName: string;
  rows: ConnectionRow[];
  /** Orgs that could be linked (not already active/invited). */
  candidates: { id: string; name: string }[];
  linkHint?: string;
}) {
  const t = useTranslations(`admin.connections.${side}`);
  const tc = useTranslations("admin.connections");
  const errorText = useErrorText();
  const link = useLink();
  const unlink = useUnlink();
  const [picked, setPicked] = useState<string>();
  const [removing, setRemoving] = useState<ConnectionRow | null>(null);
  const ids = (otherId: string) => (side === "vendor" ? { vendorOrgId: selfId, buyerOrgId: otherId } : { vendorOrgId: otherId, buyerOrgId: selfId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <Table className="text-sm" aria-label={title}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("column")}</TableHead>
                <TableHead>{tc("status")}</TableHead>
                <TableHead className="hidden sm:table-cell">{tc("since")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{tc("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.relation.id}>
                  <TableCell>
                    <Link href={r.other.href} className="font-medium hover:underline">
                      {r.other.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.relation.status === "active" ? <Badge variant="success">{tc("connected")}</Badge> : <Badge variant="info">{tc("invitePending")}</Badge>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{r.relation.joinedAt ? formatDate(r.relation.joinedAt) : "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" aria-label={tc("unlinkAria", { name: r.other.name })} onClick={() => setRemoving(r)}>
                      <UnlinkIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Field>
          <FieldLabel htmlFor={`link-${side}`}>{t("link")}</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Select value={picked ?? ""} onValueChange={setPicked} disabled={candidates.length === 0}>
              <SelectTrigger id={`link-${side}`} className="w-64">
                <SelectValue placeholder={candidates.length ? t("choose") : t("allConnected")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!picked || link.isPending}
              onClick={() =>
                picked &&
                link.mutate(ids(picked), {
                  onSuccess: () => {
                    toast.success(tc("linked", { a: candidates.find((c) => c.id === picked)?.name ?? "", b: selfName }));
                    setPicked(undefined);
                  },
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {link.isPending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
              {tc("linkButton")}
            </Button>
          </div>
          <FieldDescription>
            {tc("linkNote")}
            {linkHint ? ` ${linkHint}` : ""}
          </FieldDescription>
        </Field>
      </CardContent>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc("unlinkTitle", { a: removing?.other.name ?? "", b: selfName })}</AlertDialogTitle>
            <AlertDialogDescription>{tc("unlinkDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                removing &&
                unlink.mutate(
                  { relationId: removing.relation.id, ...ids(removing.other.id) },
                  {
                    onSuccess: () => toast.success(tc("unlinked", { name: removing.other.name })),
                    onError: (e) => toast.error(errorText(e)),
                  },
                )
              }
            >
              {tc("unlink")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
