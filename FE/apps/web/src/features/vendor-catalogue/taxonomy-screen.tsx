"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, LockIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { isApiError, TAXONOMY_NAME_MAX, uuidv7, type TaxonomyItem, type TaxonomyKind } from "@repo/core";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-states";
import { CatalogueNav } from "@/features/merchandising/catalogue-nav";
import { useCatalogueErrorText } from "./parts";
import { useTaxonomy, useTaxonomyMutations } from "./queries";

/** Categories, tags and units: create (client id per intent), rename and delete with revisions. */
export function TaxonomyScreen() {
  const t = useTranslations("taxonomy");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <CatalogueNav />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <TaxonomyList kind="categories" />
        <TaxonomyList kind="tags" />
        <TaxonomyList kind="units" />
      </div>
    </div>
  );
}

const nameLength = (s: string) => Array.from(s.trim()).length;

function TaxonomyList({ kind }: { kind: TaxonomyKind }) {
  const t = useTranslations("taxonomy");
  const tk = useTranslations(`taxonomy.kind.${kind}`);
  const tc = useTranslations("common");
  const errorText = useCatalogueErrorText();
  const query = useTaxonomy(kind);
  const m = useTaxonomyMutations(kind);
  const [name, setName] = useState("");
  const [intentId, setIntentId] = useState(() => uuidv7());
  const [problem, setProblem] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<TaxonomyItem>();
  const max = TAXONOMY_NAME_MAX[kind];

  const create = () => {
    const value = name.trim();
    if (!value) return setProblem(t("nameRequired"));
    if (nameLength(value) > max) return setProblem(t("tooLong", { max }));
    m.create.mutate(
      { id: intentId, name: value },
      {
        onSuccess: () => {
          toast.success(tk("added", { name: value }));
          setName("");
          setIntentId(uuidv7());
        },
        onError: (e) => setProblem(errorText(e)),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tk("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {query.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tk("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {query.data.map((item) => (
              <TaxonomyRow key={item.id} kind={kind} item={item} onDelete={() => setPendingDelete(item)} />
            ))}
          </ul>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Field data-invalid={!!problem || undefined}>
            <FieldLabel htmlFor={`new-${kind}`} className="sr-only">
              {tk("new")}
            </FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`new-${kind}`}
                placeholder={tk("new")}
                value={name}
                aria-invalid={!!problem || undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  setProblem(undefined);
                  // A different name is a different intent; keep the id only for retries of the same one.
                  if (m.create.isError) setIntentId(uuidv7());
                  m.create.reset();
                }}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" disabled={!name.trim() || m.create.isPending}>
                  <PlusIcon data-icon="inline-start" />
                  {tc("add")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {problem && <FieldError>{problem}</FieldError>}
          </Field>
        </form>
      </CardContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tk("deleteTitle", { name: pendingDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{tk("deleteNote")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const item = pendingDelete;
                if (!item) return;
                m.remove.mutate(
                  { id: item.id, expectedRevision: item.revision, name: item.name },
                  {
                    onSuccess: () => toast.success(tk("deleted", { name: item.name })),
                    onError: (e) => toast.error(isApiError(e, "RESOURCE_REFERENCED") ? t("inUse", { name: item.name }) : errorText(e)),
                  },
                );
              }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TaxonomyRow({ kind, item, onDelete }: { kind: TaxonomyKind; item: TaxonomyItem; onDelete: () => void }) {
  const t = useTranslations("taxonomy");
  const tk = useTranslations(`taxonomy.kind.${kind}`);
  const tc = useTranslations("common");
  const errorText = useCatalogueErrorText();
  const m = useTaxonomyMutations(kind);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [problem, setProblem] = useState<string>();
  const frozen = "nameFrozen" in item && item.nameFrozen;
  const max = TAXONOMY_NAME_MAX[kind];

  const save = () => {
    const value = name.trim();
    if (!value) return setProblem(t("nameRequired"));
    if (nameLength(value) > max) return setProblem(t("tooLong", { max }));
    m.rename.mutate(
      { id: item.id, expectedRevision: item.revision, name: value },
      {
        onSuccess: () => {
          toast.success(tk("renamed", { name: value }));
          setEditing(false);
        },
        onError: (e) => setProblem(errorText(e)),
      },
    );
  };

  if (editing) {
    return (
      <li className="flex flex-col gap-1 px-3 py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            autoFocus
            value={name}
            aria-label={t("renameAria", { name: item.name })}
            aria-invalid={!!problem || undefined}
            onChange={(e) => {
              setName(e.target.value);
              setProblem(undefined);
            }}
          />
          <Button type="submit" size="icon-sm" aria-label={tc("save")} disabled={m.rename.isPending}>
            <CheckIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={tc("cancel")} onClick={() => setEditing(false)}>
            <XIcon />
          </Button>
        </form>
        {problem && <FieldError>{problem}</FieldError>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{item.name}</span>
        {frozen && (
          <Badge variant="outline" title={t("frozenHint")}>
            <LockIcon data-icon="inline-start" />
            {t("frozen")}
          </Badge>
        )}
      </span>
      <span className="flex gap-1">
        {/* CSV import takes unit, category and tag IDs (QA-017). */}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t("copyId", { name: item.name })}
          onClick={() => {
            // Without clipboard access, show the ID so it can still be copied by hand.
            const failed = () => toast.error(t("copyFailed", { id: item.id }));
            if (!navigator.clipboard) return failed();
            void navigator.clipboard.writeText(item.id).then(() => toast.success(t("idCopied", { name: item.name })), failed);
          }}
        >
          <CopyIcon />
        </Button>
        {!frozen && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("renameAria", { name: item.name })}
            onClick={() => {
              setName(item.name);
              setEditing(true);
            }}
          >
            <PencilIcon />
          </Button>
        )}
        <Button size="icon-sm" variant="ghost" aria-label={t("deleteAria", { name: item.name })} onClick={onDelete}>
          <Trash2Icon />
        </Button>
      </span>
    </li>
  );
}
