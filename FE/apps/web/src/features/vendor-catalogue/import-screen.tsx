"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, FileUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  CSV_IMPORT_COLUMNS,
  CSV_IMPORT_MAX_BYTES,
  formatDateTime,
  formatMoney,
  formatNumber,
  importStaleErrors,
  isApiError,
  type ImportPreview,
  type ImportResult,
  type ImportRowError,
} from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CatalogueNav } from "@/features/merchandising/catalogue-nav";
import { useBusiness } from "@/lib/session";
import { CatalogueFormError } from "./parts";
import { useImportMutations } from "./queries";

const KNOWN_CODES = new Set(["INVALID_VALUE", "INVALID_REFERENCE", "DUPLICATE_SKU", "SKU_RESERVED", "PLAN_LIMIT_EXCEEDED", "UNIT_REQUIRED", "BASE_PRICE_REQUIRED", "STOCK_CONFIRMATION_REQUIRED"]);

/** Create-only CSV import: upload → preview (row/column errors) → confirm with the preview revision. */
export function ImportScreen() {
  const t = useTranslations("catImport");
  const { organization } = useBusiness();
  const m = useImportMutations();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const staleErrors = importStaleErrors(m.confirm.error);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setProblem(undefined);
    m.preview.reset();
    m.confirm.reset();
  };

  const check = () => {
    if (!file) return;
    m.confirm.reset();
    m.preview.mutate(file, { onSuccess: setPreview });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <CatalogueNav />

      {result ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>{t("done", { count: result.productIds.length, countText: formatNumber(result.productIds.length) })}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{t("doneDescription")}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/vendor/catalogue">{t("viewCatalogue")}</Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset}>
                {t("startOver")}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("chooseFile")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label={t("fileAria")}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  setPreview(null);
                  m.preview.reset();
                  m.confirm.reset();
                  if (f && f.size > CSV_IMPORT_MAX_BYTES) {
                    setFile(null);
                    return setProblem(t("tooLarge"));
                  }
                  setProblem(undefined);
                  setFile(f);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => input.current?.click()}>
                  <FileUpIcon data-icon="inline-start" />
                  {t("chooseFile")}
                </Button>
                {file && <span className="text-sm text-muted-foreground">{t("fileChosen", { name: file.name, size: `${formatNumber(Math.ceil(file.size / 1024))} KB` })}</span>}
                <Button disabled={!file || m.preview.isPending} onClick={check}>
                  {m.preview.isPending && <Spinner data-icon="inline-start" />}
                  {m.preview.isPending ? t("checking") : t("check")}
                </Button>
              </div>
              {problem && <FieldError>{problem}</FieldError>}
              <CatalogueFormError error={m.preview.error} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("formatTitle")}</CardTitle>
              <CardDescription>{t("formatDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <code className="rounded bg-muted p-2 font-mono text-xs break-all">{CSV_IMPORT_COLUMNS.join(",")}</code>
              <p className="text-muted-foreground">{t("formatNotes")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {preview && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {preview.valid && staleErrors.length === 0 ? t("valid") : t("errorsTitle")}
              <Badge variant={preview.valid ? "success" : "destructive"}>{preview.valid ? t("valid") : t("errorsTitle")}</Badge>
            </CardTitle>
            <CardDescription>
              {t("summary", { count: preview.rowCount, countText: formatNumber(preview.rowCount), time: formatDateTime(preview.expiresAt) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!preview.valid && <p className="text-sm text-destructive">{t("invalid")}</p>}
            {staleErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>{t("staleTitle")}</AlertTitle>
                <AlertDescription>{t("staleDescription")}</AlertDescription>
              </Alert>
            )}
            <RowErrors errors={staleErrors.length ? staleErrors : preview.errors} />
            {!isApiError(m.confirm.error, "IMPORT_STALE") && <CatalogueFormError error={m.confirm.error} />}
            {preview.rows.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t("rowsTitle")}</h3>
                <div className="max-h-96 overflow-auto rounded-lg border">
                  <Table className="text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">{t("row")}</TableHead>
                        <TableHead>{t("sku")}</TableHead>
                        <TableHead>{t("name")}</TableHead>
                        <TableHead className="text-right">{t("basePrice")}</TableHead>
                        <TableHead>{t("activate")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.rows.map((r) => (
                        <TableRow key={r.row}>
                          <TableCell className="font-mono tabular-nums">{r.row}</TableCell>
                          <TableCell className="font-mono text-xs">{r.product.sku}</TableCell>
                          <TableCell>{r.product.name}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{r.basePrice ? formatMoney(r.basePrice, organization.currency) : "—"}</TableCell>
                          <TableCell>{r.activate ? t("yes") : t("no")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!preview.valid || staleErrors.length > 0 || m.confirm.isPending}
                onClick={() =>
                  m.confirm.mutate({ previewId: preview.id, expectedRevision: preview.revision }, { onSuccess: (r) => setResult(r) })
                }
              >
                {m.confirm.isPending && <Spinner data-icon="inline-start" />}
                {t("confirm", { count: preview.rows.length, countText: formatNumber(preview.rows.length) })}
              </Button>
              <Button variant="outline" onClick={reset}>
                {t("startOver")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RowErrors({ errors }: { errors: ImportRowError[] }) {
  const t = useTranslations("catImport");
  if (errors.length === 0) return null;
  return (
    <ul className="flex max-h-72 flex-col divide-y overflow-auto rounded-lg border text-sm">
      {errors.map((e, i) => (
        <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
          <span className="font-mono text-xs">{t("errorLine", { row: e.row, column: e.column })}</span>
          <span className="text-destructive">{KNOWN_CODES.has(e.code) ? t(`code.${e.code}` as "code.INVALID_VALUE") : t("code.other", { code: e.code })}</span>
        </li>
      ))}
    </ul>
  );
}
