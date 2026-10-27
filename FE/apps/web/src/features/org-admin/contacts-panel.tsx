"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ContactRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, Share2Icon, ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import {
  canManageOrganization,
  contactDraftFrom,
  contactFromDraft,
  contactProblems,
  isApiError,
  organizationUpdate,
  textProblem,
  uuidv7,
  type BusinessContact,
} from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { useIdErrorText } from "@/features/auth/error-text";
import { FormError } from "@/features/auth/form-error";
import { useBusiness } from "@/lib/session";
import { ConflictAlert, ContactFields, StateFilter, useProblemText } from "./parts";
import { useArchiveContact, useContacts, useOrganization, useSaveContact, useUpdateOrganization } from "./queries";

type Filter = "ACTIVE" | "ARCHIVED" | "all";

/** Business contacts (owner/admin manage, staff read) and which one is shared with partners. */
export function ContactsPanel() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const errorText = useIdErrorText();
  const { account } = useBusiness();
  const canEdit = canManageOrganization(account.role);
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const contacts = useContacts({ size: 100, ...(filter === "all" ? {} : { state: filter }) });
  const org = useOrganization();
  const share = useUpdateOrganization();
  const archive = useArchiveContact();
  const [editing, setEditing] = useState<BusinessContact | "new" | null>(null);

  const setShared = (contact: BusinessContact) =>
    org.data &&
    share.mutate(organizationUpdate(org.data, { partnerContactId: contact.id }), {
      onSuccess: () => toast.success(t("contacts.shared")),
      onError: (e) => {
        if (isApiError(e, "REVISION_CONFLICT")) void org.refetch();
        toast.error(errorText(e));
      },
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("contacts.title")}</CardTitle>
        <CardDescription>{canEdit ? t("contacts.description") : t("readOnly")}</CardDescription>
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
              {t("contacts.add")}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {contacts.isError ? (
          <ErrorState error={contacts.error} onRetry={() => void contacts.refetch()} />
        ) : contacts.isPending ? (
          <RowsSkeleton rows={3} />
        ) : contacts.data.items.length === 0 ? (
          <EmptyState icon={ContactRoundIcon} title={t("contacts.empty")} description={t("contacts.emptyHint")} />
        ) : (
          <Table className="text-sm" aria-label={t("contacts.title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contacts.label")}</TableHead>
                <TableHead>{t("contactFields.name")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("contactFields.phone")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("contactFields.email")}</TableHead>
                {canEdit && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {c.label}
                      {org.data?.partnerContactId === c.id && <Badge>{t("contacts.shared")}</Badge>}
                      {c.state === "ARCHIVED" && <Badge variant="outline">{t("archived")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{c.contact.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.contact.phone}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.contact.email ?? "—"}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={t("contacts.actionsFor", { name: c.label })}>
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onSelect={() => setEditing(c)}>
                              <PencilIcon />
                              {tc("edit")}
                            </DropdownMenuItem>
                            {c.state === "ACTIVE" && org.data?.partnerContactId !== c.id && (
                              <DropdownMenuItem onSelect={() => setShared(c)}>
                                <Share2Icon />
                                {t("contacts.share")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onSelect={() =>
                                archive.mutate(
                                  { contact: c, archive: c.state === "ACTIVE" },
                                  {
                                    onSuccess: () => toast.success(c.state === "ACTIVE" ? t("contacts.archivedToast") : t("contacts.restoredToast")),
                                    onError: (e) => {
                                      if (isApiError(e, "REVISION_CONFLICT")) void contacts.refetch();
                                      toast.error(errorText(e));
                                    },
                                  },
                                )
                              }
                            >
                              {c.state === "ACTIVE" ? <ArchiveIcon /> : <ArchiveRestoreIcon />}
                              {c.state === "ACTIVE" ? t("archive") : t("restore")}
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
        {canEdit && <p className="mt-3 text-xs text-muted-foreground">{t("contacts.archiveHint")}</p>}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing !== null && (
            <ContactForm
              key={editing === "new" ? "new" : editing.id}
              existing={editing === "new" ? undefined : editing}
              onReload={async () => {
                const fresh = await contacts.refetch();
                return fresh.data?.items.find((c) => editing !== "new" && c.id === editing.id);
              }}
              onClose={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ContactForm({
  existing: initial,
  onReload,
  onClose,
}: {
  existing?: BusinessContact;
  onReload: () => Promise<BusinessContact | undefined>;
  onClose: () => void;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const problemText = useProblemText();
  // One id per create intent: a retry after a lost response replays instead of duplicating.
  const [id] = useState(uuidv7);
  const [existing, setExisting] = useState(initial);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [contact, setContact] = useState(() => contactDraftFrom(initial?.contact ?? null));
  const [attempted, setAttempted] = useState(false);
  const save = useSaveContact();
  const labelProblem = textProblem(label);
  const problems = contactProblems(contact);
  const invalid = !!labelProblem || Object.keys(problems).length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? t("contacts.edit") : t("contacts.add")}</DialogTitle>
      </DialogHeader>
      <form
        id="contact-form"
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (invalid) return;
          save.mutate(
            { id, existing, label: label.trim(), contact: contactFromDraft(contact) },
            {
              onSuccess: () => {
                toast.success(existing ? t("contacts.saved") : t("contacts.added"));
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
          <Field data-invalid={(attempted && !!labelProblem) || undefined}>
            <FieldLabel htmlFor="contact-label">{t("contacts.label")}</FieldLabel>
            <Input id="contact-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            {attempted && labelProblem ? <FieldError>{problemText(labelProblem)}</FieldError> : <FieldDescription>{t("contacts.labelHint")}</FieldDescription>}
          </Field>
          <ContactFields idPrefix="contact" value={contact} onChange={setContact} problems={attempted ? problems : {}} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button type="submit" form="contact-form" disabled={save.isPending}>
          {save.isPending && <Spinner data-icon="inline-start" />}
          {tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
