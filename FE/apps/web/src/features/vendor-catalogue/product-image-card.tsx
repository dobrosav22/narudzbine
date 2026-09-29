"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { MAX_PRODUCT_IMAGE_MB, PRODUCT_IMAGE_TYPES, productImageProblem, serviceError, services, type Msg } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useTranslations } from "next-intl";
import { useErrorText, useMsg } from "@/lib/i18n";

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(serviceError("VALIDATION", "errors.imageRead"));
    reader.readAsDataURL(file);
  });
}

/**
 * 03 → Product detail/edit "images": one picture per product (04 has a single imageUrl).
 * The file uploads straight away; the returned URL goes into the draft and is saved with
 * the rest of the product, so Discard/leaving the page keeps the old picture.
 */
export function ProductImageCard({
  vendorOrgId,
  productName,
  value,
  onChange,
}: {
  vendorOrgId: string;
  productName: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const t = useTranslations("productEditor.image");
  const tm = useMsg();
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<Msg>();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const uri = await readAsDataUrl(file);
      return services.catalogue.uploadProductImage({ vendorOrgId, uri, mimeType: file.type, sizeBytes: file.size });
    },
    onSuccess: ({ url }) => onChange(url),
  });
  const error = problem ? tm(problem) : upload.error ? errorText(upload.error) : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { mb: MAX_PRODUCT_IMAGE_MB })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProductImage
          src={value || undefined}
          alt={value ? t("alt", { name: productName || t("thisProduct") }) : ""}
          className="aspect-[4/3] w-full rounded-lg ring-1 ring-foreground/10"
          sizes="(min-width: 1024px) 25vw, 100vw"
        />
        <input
          ref={input}
          type="file"
          accept={PRODUCT_IMAGE_TYPES.join(",")}
          className="sr-only"
          aria-label={t("fileAria")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // picking the same file again should still fire
            if (!file) return;
            upload.reset();
            const why = productImageProblem({ mimeType: file.type, sizeBytes: file.size });
            setProblem(why);
            if (!why) upload.mutate(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? <Spinner data-icon="inline-start" /> : <ImageUpIcon data-icon="inline-start" />}
            {value ? t("replace") : t("upload")}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              disabled={upload.isPending}
              onClick={() => {
                setProblem(undefined);
                onChange("");
              }}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("remove")}
            </Button>
          )}
        </div>
        {error && <FieldError>{error}</FieldError>}
      </CardContent>
    </Card>
  );
}
