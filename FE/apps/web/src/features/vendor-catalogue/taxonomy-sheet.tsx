"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-states";
import { useCategories, useTags, useTaxonomyMutations } from "./queries";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/**
 * Vendor-defined categories and tags (01 §3). Categories are flat (01 §11 still
 * open; BUILD_LOG "Other open questions") — parentCategoryId is never set here.
 */
export function TaxonomySheet({
  vendorOrgId,
  open,
  onOpenChange,
}: {
  vendorOrgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("taxonomy");
  const categories = useCategories(vendorOrgId);
  const tags = useTags(vendorOrgId);
  const m = useTaxonomyMutations(vendorOrgId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <TaxonomyList kind="category" query={categories} create={m.createCategory} remove={m.deleteCategory} />
          <Separator />
          <TaxonomyList kind="tag" query={tags} create={m.createTag} remove={m.deleteTag} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface Item {
  id: string;
  name: string;
}

function TaxonomyList({
  kind,
  query,
  create,
  remove,
}: {
  kind: "category" | "tag";
  query: { data?: Item[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  create: { mutate: (name: string, opts?: { onSuccess?: () => void }) => void; isPending: boolean; error: unknown; reset: () => void };
  remove: { mutate: (id: string, opts?: { onSuccess?: () => void }) => void };
}) {
  const t = useTranslations(`taxonomy.${kind}`);
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Item>();
  const inputId = `new-${kind}`;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {query.data?.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="truncate">{item.name}</span>
              <Button size="icon-sm" variant="ghost" aria-label={t("deleteAria", { name: item.name })} onClick={() => setPendingDelete(item)}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate(name, {
            onSuccess: () => {
              toast.success(t("added", { name: name.trim() }));
              setName("");
            },
          });
        }}
      >
        <Field data-invalid={!!create.error || undefined}>
          <FieldLabel htmlFor={inputId} className="sr-only">
            {t("new")}
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={inputId}
              placeholder={t("new")}
              value={name}
              aria-invalid={!!create.error || undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (create.error) create.reset();
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" disabled={!name.trim() || create.isPending}>
                <PlusIcon data-icon="inline-start" />
                {tc("add")}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {!!create.error && <FieldError>{errorText(create.error)}</FieldError>}
        </Field>
      </form>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle", { name: pendingDelete?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteNote")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!pendingDelete) return;
                const item = pendingDelete;
                remove.mutate(item.id, { onSuccess: () => toast.success(t("deleted", { name: item.name })) });
              }}
            >
              {tc("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
