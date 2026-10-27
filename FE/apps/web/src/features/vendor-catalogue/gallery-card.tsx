"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUpIcon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  assetFailureMsg,
  catalogueQueries,
  GALLERY_MAX,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  isImageType,
  uploadImageBytes,
  uuidv7,
  waitForAsset,
  type ImageType,
} from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useMsg } from "@/lib/i18n";
import { ProductThumb, useCatalogueErrorText } from "./parts";
import { useProduct, useSetGallery } from "./queries";

type Phase = "uploading" | "uploadError" | "processing" | "slow" | "failed" | "attaching" | "attachError";
interface Pending {
  id: string;
  file: File;
  type: ImageType;
  phase: Phase;
  error?: string;
}

/**
 * Product gallery (0..5 READY images, first = main). Adding: client UUIDv7 asset id → upload bytes
 * → poll until READY → replace the gallery with the current product revision. Retries reuse the
 * same asset id and bytes.
 */
export function GalleryCard({ productId, name }: { productId: string; name: string }) {
  const t = useTranslations("productEditor.image");
  const tm = useMsg();
  const errorText = useCatalogueErrorText();
  const qc = useQueryClient();
  const product = useProduct(productId).data;
  const gallery = useSetGallery(productId);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string>();
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  if (!product) return null;
  const ids = product.galleryAssetIds;

  const update = (patch: Partial<Pending>) => alive.current && setPending((p) => (p ? { ...p, ...patch } : p));

  const save = async (assetIds: string[]) => {
    const latest = await qc.fetchQuery({ ...catalogueQueries.product(productId), staleTime: 0 });
    return gallery.mutateAsync({ expectedRevision: latest.revision, assetIds });
  };

  const attach = async (p: Pending) => {
    update({ phase: "attaching", error: undefined });
    try {
      const latest = await qc.fetchQuery({ ...catalogueQueries.product(productId), staleTime: 0 });
      if (!latest.galleryAssetIds.includes(p.id)) await gallery.mutateAsync({ expectedRevision: latest.revision, assetIds: [...latest.galleryAssetIds, p.id] });
      if (alive.current) setPending(null);
      toast.success(t("added"));
    } catch (e) {
      update({ phase: "attachError", error: errorText(e) });
    }
  };

  const poll = async (p: Pending) => {
    update({ phase: "processing", error: undefined });
    try {
      const asset = await waitForAsset(p.id, { timeoutMs: 60_000 });
      if (asset.state === "READY") return attach(p);
      if (asset.state === "FAILED" || asset.state === "DELETED") return update({ phase: "failed", error: tm(assetFailureMsg(asset.failureCode)) });
      update({ phase: "slow" });
    } catch (e) {
      update({ phase: "slow", error: errorText(e) });
    }
  };

  const upload = async (p: Pending) => {
    update({ phase: "uploading", error: undefined });
    try {
      await uploadImageBytes(p.id, p.file, p.type);
    } catch (e) {
      return update({ phase: "uploadError", error: errorText(e) });
    }
    return poll(p);
  };

  const start = (file: File) => {
    setProblem(undefined);
    if (!isImageType(file.type)) return setProblem(t("wrongType"));
    if (file.size > IMAGE_MAX_BYTES) return setProblem(t("tooLarge", { mb: 5 }));
    if (ids.length >= GALLERY_MAX) return setProblem(t("full", { count: GALLERY_MAX }));
    const next: Pending = { id: uuidv7(), file, type: file.type, phase: "uploading" };
    setPending(next);
    void upload(next);
  };

  const busy = gallery.isPending || (!!pending && pending.phase !== "failed");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { count: GALLERY_MAX, mb: 5 })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ids.length === 0 ? (
          <ProductThumb assetId={undefined} className="aspect-[4/3] w-full rounded-lg ring-1 ring-foreground/10" />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {ids.map((id, i) => (
              <li key={id} className="flex flex-col gap-1">
                <div className="relative">
                  <ProductThumb assetId={id} alt={t("alt", { n: i + 1, name })} className="aspect-[4/3] w-full rounded-lg ring-1 ring-foreground/10" />
                  {i === 0 && (
                    <Badge variant="info" className="absolute top-1 left-1">
                      {t("main")}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  {i > 0 && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("makeMain")}
                      disabled={busy}
                      onClick={() =>
                        void save([id, ...ids.filter((x) => x !== id)]).then(
                          () => toast.success(t("reordered")),
                          (e) => toast.error(errorText(e)),
                        )
                      }
                    >
                      <StarIcon />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("remove")}
                    disabled={busy}
                    onClick={() =>
                      void save(ids.filter((x) => x !== id)).then(
                        () => toast.success(t("removed")),
                        (e) => toast.error(errorText(e)),
                      )
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pending && (
          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm" aria-live="polite">
            <div className="flex items-center gap-2">
              {["uploading", "processing", "attaching"].includes(pending.phase) && <Spinner />}
              <span className="truncate">{pending.file.name}</span>
            </div>
            {pending.phase === "uploading" && <p className="text-muted-foreground">{t("uploading")}</p>}
            {(pending.phase === "processing" || pending.phase === "attaching") && <p className="text-muted-foreground">{t("processing")}</p>}
            {pending.phase === "slow" && <p className="text-muted-foreground">{t("processingSlow")}</p>}
            {pending.error && <FieldError>{pending.error}</FieldError>}
            <div className="flex flex-wrap gap-2">
              {pending.phase === "uploadError" && (
                <Button type="button" size="sm" variant="outline" onClick={() => void upload(pending)}>
                  {t("retryUpload")}
                </Button>
              )}
              {pending.phase === "slow" && (
                <Button type="button" size="sm" variant="outline" onClick={() => void poll(pending)}>
                  {t("checkAgain")}
                </Button>
              )}
              {pending.phase === "attachError" && (
                <Button type="button" size="sm" variant="outline" onClick={() => void attach(pending)}>
                  {t("checkAgain")}
                </Button>
              )}
              {["uploadError", "slow", "failed", "attachError"].includes(pending.phase) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)}>
                  {t("discard")}
                </Button>
              )}
            </div>
          </div>
        )}

        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          aria-label={t("fileAria")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) start(file);
          }}
        />
        <div>
          <Button type="button" variant="outline" disabled={busy || ids.length >= GALLERY_MAX} onClick={() => input.current?.click()}>
            <ImageUpIcon data-icon="inline-start" />
            {t("add")}
          </Button>
        </div>
        {problem && <FieldError>{problem}</FieldError>}
      </CardContent>
    </Card>
  );
}
