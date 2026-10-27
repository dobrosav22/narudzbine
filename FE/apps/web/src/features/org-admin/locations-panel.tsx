"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArchiveIcon, ArchiveRestoreIcon, MapPinIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import {
  addressProblems,
  canManageOrganization,
  cleanAddress,
  contactDraftFrom,
  contactFromDraft,
  contactProblems,
  emptyAddress,
  formatAddress,
  isApiError,
  isContactDraftBlank,
  textOrNull,
  textProblem,
  uuidv7,
  type Location,
} from "@repo/core";
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useFieldErrorText, useIdErrorText } from "@/features/auth/error-text";
import { FormError } from "@/features/auth/form-error";
import { useBusiness } from "@/lib/session";
import { AddressFields, ConflictAlert, ContactFields, StateFilter, useProblemText } from "./parts";
import { useArchiveLocation, useLocations, useSaveLocation } from "./queries";

type Filter = "ACTIVE" | "ARCHIVED" | "all";

/**
 * Saved locations: vendor fulfilment sites and buyer delivery addresses are the same resource.
 * Owner/admin manage; everyone reads. There's no delete — archive keeps history and can be undone.
 */
export function LocationsPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorText = useIdErrorText();
  const { account, organization } = useBusiness();
  const vendor = organization.type === "VENDOR";
  const canEdit = canManageOrganization(account.role);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const locations = useLocations({ size: 100, ...(filter === "all" ? {} : { state: filter }) });
  const archive = useArchiveLocation();
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  const [archiving, setArchiving] = useState<Location | null>(null);

  const toggleArchive = (location: Location) =>
    archive.mutate(
      { location, archive: location.state === "ACTIVE" },
      {
        onSuccess: () => toast.success(location.state === "ACTIVE" ? t("locations.archivedToast") : t("locations.restoredToast")),
        onError: (e) => {
          if (isApiError(e, "REVISION_CONFLICT")) void locations.refetch();
          toast.error(errorText(e));
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{vendor ? t("locations.vendorTitle") : t("locations.buyerTitle")}</CardTitle>
        <CardDescription>
          {vendor ? t("locations.vendorDescription") : t("locations.buyerDescription")} {!canEdit && t("readOnly")}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <StateFilter
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ACTIVE", label: t("stateFilter.ACTIVE") },
              { value: "ARCHIVED", label: t("stateFilter.ARCHIVED") },
              { value: "all", label: t("stateFilter.all") },
            ]}
          />
          {canEdit && (
            <Button onClick={() => setEditing("new")}>
              <PlusIcon data-icon="inline-start" />
              {t("locations.add")}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {locations.isError ? (
          <ErrorState error={locations.error} onRetry={() => void locations.refetch()} />
        ) : locations.isPending ? (
          <RowsSkeleton rows={3} />
        ) : locations.data.items.length === 0 ? (
          <EmptyState icon={MapPinIcon} title={t("locations.empty")} description={canEdit ? t("locations.emptyHint") : undefined} />
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>{t("locations.name")}</TableHead>
                <TableHead>{t("locations.address")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("locations.contact")}</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.data.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {l.name}
                      {l.state === "ARCHIVED" && <Badge variant="outline">{t("archived")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{formatAddress(l.address)}</TableCell>
                  <TableCell className="hidden md:table-cell">{l.contact ? `${l.contact.name}, ${l.contact.phone}` : t("locations.noContact")}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t("locations.actionsFor", { name: l.name })}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => setEditing(l)}>
                              <PencilIcon />
                              {tc("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => (l.state === "ACTIVE" ? setArchiving(l) : toggleArchive(l))}>
                              {l.state === "ACTIVE" ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                              {l.state === "ACTIVE" ? t("archive") : t("restore")}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          {editing !== null && (
            <LocationForm
              key={editing === "new" ? "new" : editing.id}
              existing={editing === "new" ? undefined : editing}
              vendor={vendor}
              country={organization.country}
              onReload={async () => {
                const fresh = await locations.refetch();
                return fresh.data?.items.find((l) => editing !== "new" && l.id === editing.id);
              }}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={archiving !== null} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("locations.archiveTitle", { name: archiving?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("locations.archiveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiving && toggleArchive(archiving)}>{t("archive")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LocationForm({
  existing: initial,
  vendor,
  country,
  onReload,
  onClose,
}: {
  existing?: Location;
  vendor: boolean;
  country: Location["address"]["country"];
  onReload: () => Promise<Location | undefined>;
  onClose: () => void;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const problemText = useProblemText();
  const fieldError = useFieldErrorText();
  // One id per create intent: a retry after a lost response replays instead of duplicating.
  const [id] = useState(uuidv7);
  const [existing, setExisting] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? emptyAddress(country));
  const [contact, setContact] = useState(() => contactDraftFrom(initial?.contact ?? null));
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [attempted, setAttempted] = useState(false);
  const save = useSaveLocation();

  // Buyer delivery locations need a receiving contact; vendor ones may have none.
  const noContact = vendor && isContactDraftBlank(contact);
  const nameProblem = textProblem(name);
  const addrProblems = addressProblems(address);
  const cProblems = noContact ? {} : contactProblems(contact);
  const invalid = !!nameProblem || Object.keys(addrProblems).length > 0 || Object.keys(cProblems).length > 0;
  const nameError = (attempted ? problemText(nameProblem) : undefined) ?? fieldError(save.error, "name");

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? t("locations.edit") : t("locations.add")}</DialogTitle>
      </DialogHeader>
      <form
        id="location-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (invalid) return;
          save.mutate(
            {
              id,
              existing,
              fields: {
                name: name.trim(),
                address: cleanAddress(address),
                contact: noContact ? null : contactFromDraft(contact),
                instructions: textOrNull(instructions),
              },
            },
            {
              onSuccess: () => {
                toast.success(existing ? t("locations.saved") : t("locations.added"));
                onClose();
              },
            },
          );
        }}
      >
        <FieldGroup>
          {isApiError(save.error, "REVISION_CONFLICT") ? (
            <ConflictAlert
              onLoadLatest={() =>
                void onReload().then((fresh) => {
                  if (fresh) setExisting(fresh);
                  save.reset();
                })
              }
            />
          ) : (
            <FormError error={save.error} />
          )}
          <Field data-invalid={!!nameError || undefined}>
            <FieldLabel htmlFor="location-name">{t("locations.name")}</FieldLabel>
            <Input id="location-name" value={name} onChange={(e) => setName(e.target.value)} />
            {nameError && <FieldError>{nameError}</FieldError>}
          </Field>
          <FieldSet>
            <FieldLegend variant="label">{t("locations.address")}</FieldLegend>
            <AddressFields
              idPrefix="location-address"
              value={address}
              onChange={setAddress}
              problems={attempted ? addrProblems : {}}
              serverError={(key) => fieldError(save.error, `address/${key}`)}
            />
          </FieldSet>
          <FieldSet>
            <FieldLegend variant="label">{vendor ? t("locations.contactOptional") : t("locations.contactRequired")}</FieldLegend>
            <ContactFields idPrefix="location-contact" value={contact} onChange={setContact} problems={attempted ? cProblems : {}} />
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="location-instructions">{t("locations.instructions")}</FieldLabel>
            <Textarea id="location-instructions" maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            <FieldDescription>{t("locations.instructionsHint")}</FieldDescription>
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" form="location-form" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          {tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
