"use client";

import { useState } from "react";
import { MapPinIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  countMsg,
  emptyLocationDraft,
  isServiceError,
  LOCATION_COPY,
  validateLocationDraft,
  type Location,
  type LocationDraft,
  type OrgType,
  type VendorLocation,
  type Msg,
} from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
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
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormError } from "@/features/auth/form-error";
import { useDeleteLocation, useLocations, useSaveLocation } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

type AnyLocation = Location | VendorLocation;

/**
 * 03 → "Locations" (both sides): list/add/edit/delete. Vendors call them warehouses,
 * buyers delivery locations (01 §7). Deleting one still used by open orders is refused
 * by the service with a message that says why.
 */
export function LocationsPanel({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const t = useTranslations("settings.locations");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const copy = LOCATION_COPY[orgType];
  const k = (key: string) => tm({ key });
  const org = { orgType, orgId };
  const locations = useLocations(org);
  const remove = useDeleteLocation(org);
  const [editing, setEditing] = useState<AnyLocation | "new" | null>(null);
  const [deleting, setDeleting] = useState<AnyLocation | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{k(copy.title)}</CardTitle>
        <CardDescription>
          {orgType === "vendor" ? t("vendorDescription") : t("buyerDescription")}
        </CardDescription>
        <CardAction>
          <Button onClick={() => setEditing("new")}>
            <PlusIcon data-icon="inline-start" />
            {k(copy.add)}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {locations.isError ? (
          <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
        ) : locations.isPending ? (
          <RowsSkeleton rows={3} />
        ) : locations.data.length === 0 ? (
          <EmptyState
            icon={MapPinIcon}
            title={k(copy.none)}
            description={orgType === "vendor" ? t("vendorEmpty") : t("buyerEmpty")}
          />
        ) : (
          <Table className="text-sm" aria-label={k(copy.title)}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("address")}</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.address}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("actionsFor", { name: l.name })}>
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem onSelect={() => setEditing(l)}>
                            <PencilIcon />
                            {tc("edit")}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(l)}>
                            <Trash2Icon />
                            {tc("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {locations.data && locations.data.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">{tm(countMsg(copy.count, locations.data.length))}</p>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing !== null && (
            <LocationForm
              key={editing === "new" ? "new" : editing.id}
              org={org}
              location={editing === "new" ? undefined : editing}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: deleting?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => toast.success(t("deleted", { name: deleting.name })),
                  // CONFLICT (open orders use it) and VALIDATION (last delivery location) carry the reason.
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LocationForm({
  org,
  location,
  onClose,
}: {
  org: { orgType: OrgType; orgId: string };
  location: AnyLocation | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("settings.locations");
  const tc = useTranslations("common");
  const tm = useMsg();
  const errorText = useErrorText();
  const copy = LOCATION_COPY[org.orgType];
  const [draft, setDraft] = useState<LocationDraft>(() => (location ? { name: location.name, address: location.address } : emptyLocationDraft()));
  const [attempted, setAttempted] = useState(false);
  const save = useSaveLocation(org);
  const { input, errors } = validateLocationDraft(draft);
  const shownMsg: Partial<Record<keyof LocationDraft, Msg>> = attempted ? errors : {};
  const shown = { name: shownMsg.name && tm(shownMsg.name), address: shownMsg.address && tm(shownMsg.address) };
  const set = (key: keyof LocationDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (save.error) save.reset();
    setDraft((d) => ({ ...d, [key]: e.target.value }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{location ? t(org.orgType === "vendor" ? "editWarehouse" : "editLocation") : tm({ key: copy.add })}</DialogTitle>
        <DialogDescription>{org.orgType === "vendor" ? t("vendorFormNote") : t("buyerFormNote")}</DialogDescription>
      </DialogHeader>
      <form
        id="location-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (!input) return;
          save.mutate(
            { locationId: location?.id, input },
            {
              onSuccess: (saved) => {
                toast.success(location ? t("saved", { name: saved.name }) : t("added", { name: saved.name }));
                onClose();
              },
            },
          );
        }}
      >
        <FieldGroup>
          {save.error && !isServiceError(save.error, "VALIDATION") && <FormError error={save.error} />}
          <Field data-invalid={!!shown.name || undefined}>
            <FieldLabel htmlFor="location-name">{t("name")}</FieldLabel>
            <Input id="location-name" value={draft.name} onChange={set("name")} aria-invalid={!!shown.name || undefined} />
            {shown.name && <FieldError>{shown.name}</FieldError>}
          </Field>
          <Field data-invalid={!!shown.address || undefined}>
            <FieldLabel htmlFor="location-address">{t("address")}</FieldLabel>
            <Input id="location-address" value={draft.address} onChange={set("address")} aria-invalid={!!shown.address || undefined} />
            {shown.address && <FieldError>{shown.address}</FieldError>}
            {isServiceError(save.error, "VALIDATION") && <FieldError>{errorText(save.error)}</FieldError>}
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" form="location-form" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          {location ? tc("save") : tm({ key: copy.add })}
        </Button>
      </DialogFooter>
    </>
  );
}
