"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { productCommands, type ProductCommand } from "@repo/core";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { CatalogueFormError, ProductStateBadge, useCatalogueErrorText } from "./parts";
import { useProduct, useProductCommand, useSetFeatured } from "./queries";

/** Explicit publication commands and the featured flag; each uses the product's current revision. */
export function StatusCard({ productId }: { productId: string }) {
  const t = useTranslations("productEditor");
  const tc = useTranslations("common");
  const errorText = useCatalogueErrorText();
  const product = useProduct(productId).data;
  const command = useProductCommand(productId);
  const featured = useSetFeatured();
  const [archiving, setArchiving] = useState(false);
  if (!product) return null;

  const run = (c: ProductCommand) =>
    command.mutate({ command: c, expectedRevision: product.revision }, { onSuccess: () => toast.success(t(`commandDone.${c}`)) });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("status")}
          <ProductStateBadge state={product.state} />
        </CardTitle>
        <CardDescription>{t(`stateDescription.${product.state}`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {productCommands(product.state).map((c) => (
            <Button
              key={c}
              type="button"
              variant={c === "activate" ? "default" : "outline"}
              disabled={command.isPending}
              onClick={() => (c === "archive" ? setArchiving(true) : run(c))}
            >
              {command.isPending && command.variables?.command === c && <Spinner data-icon="inline-start" />}
              {t(`command.${c}`)}
            </Button>
          ))}
        </div>
        {product.state === "INACTIVE" && <p className="text-sm text-muted-foreground">{t("activateHint")}</p>}
        <CatalogueFormError error={command.error} />
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="featured">{t("featured")}</FieldLabel>
            <FieldDescription>{t("featuredDescription")}</FieldDescription>
          </FieldContent>
          <Switch
            id="featured"
            checked={product.featured}
            disabled={featured.isPending}
            onCheckedChange={(on) =>
              featured.mutate(
                { product, featured: on },
                { onSuccess: () => toast.success(on ? t("featuredOn") : t("featuredOff")), onError: (e) => toast.error(errorText(e)) },
              )
            }
          />
        </Field>
      </CardContent>
      <AlertDialog open={archiving} onOpenChange={setArchiving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("archiveTitle", { name: product.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t("archiveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("archive")}>{t("command.archive")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
