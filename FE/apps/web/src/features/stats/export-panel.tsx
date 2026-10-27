"use client";

import { useState } from "react";
import { DownloadIcon, FileDownIcon, RotateCwIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  downloadReportExport,
  formatDateTime,
  isUncertainOutcome,
  REPORT_EXPORT_FAILURE_CODES,
  reportExportFileName,
  requestReportExport,
  uuidv7,
  type ReportExportKind,
  type ReportRange,
} from "@repo/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useErrorText } from "@/lib/i18n";
import { useExportStatus } from "./queries";
import { rangeText } from "./stat-parts";

/** One export intent. `id` is generated once and reused for a retry of the same request. */
interface ExportJob {
  id: string;
  kind: ReportExportKind;
  range: ReportRange;
  phase: "requesting" | "accepted" | "uncertain" | "refused";
  error?: unknown;
}

function saveCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * CSV exports of the selected range (requester-only, asynchronous): request → poll → download.
 * There is no list endpoint, so jobs are tracked only on this page while it is open.
 */
export function useExports() {
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const update = (id: string, patch: Partial<ExportJob>) => setJobs((all) => all.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const send = (job: ExportJob) => {
    update(job.id, { phase: "requesting", error: undefined });
    // Called directly (not one shared useMutation) so concurrent jobs each get their own outcome.
    requestReportExport({ id: job.id, kind: job.kind, from: job.range.from, to: job.range.to }).then(
      () => update(job.id, { phase: "accepted" }),
      (error: unknown) => update(job.id, { phase: isUncertainOutcome(error) ? "uncertain" : "refused", error }),
    );
  };

  const start = (kind: ReportExportKind, range: ReportRange) => {
    const job: ExportJob = { id: uuidv7(), kind, range, phase: "requesting" };
    setJobs((all) => [job, ...all]);
    send(job);
  };
  const dismiss = (id: string) => setJobs((all) => all.filter((j) => j.id !== id));
  return { jobs, start, retry: send, dismiss };
}

export function ExportMenu({ kinds, onPick }: { kinds: readonly ReportExportKind[]; onPick: (kind: ReportExportKind) => void }) {
  const t = useTranslations("repExport");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <FileDownIcon data-icon="inline-start" />
          {t("trigger")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("menuLabel")}</DropdownMenuLabel>
          {kinds.map((kind) => (
            <DropdownMenuItem key={kind} onSelect={() => onPick(kind)}>
              {t(`kind.${kind}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ExportJobs({ jobs, onRetry, onDismiss }: { jobs: ExportJob[]; onRetry: (job: ExportJob) => void; onDismiss: (id: string) => void }) {
  const t = useTranslations("repExport");
  if (jobs.length === 0) return null;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y" aria-label={t("title")}>
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{t(`kind.${job.kind}`)}</span>
                <span className="text-xs text-muted-foreground">{rangeText(job.range)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {job.phase === "accepted" ? <AcceptedJob job={job} /> : <PendingJob job={job} onRetry={onRetry} />}
                <Button variant="ghost" size="icon-sm" aria-label={t("dismiss")} onClick={() => onDismiss(job.id)}>
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PendingJob({ job, onRetry }: { job: ExportJob; onRetry: (job: ExportJob) => void }) {
  const t = useTranslations("repExport");
  const errorText = useErrorText();
  if (job.phase === "requesting") return <Spinner aria-label={t("requesting")} />;
  return (
    <>
      <span className="text-xs text-destructive">{job.phase === "uncertain" ? t("uncertain") : errorText(job.error)}</span>
      {job.phase === "uncertain" && (
        <Button variant="outline" size="sm" onClick={() => onRetry(job)}>
          <RotateCwIcon data-icon="inline-start" />
          {t("retry")}
        </Button>
      )}
    </>
  );
}

function AcceptedJob({ job }: { job: ExportJob }) {
  const t = useTranslations("repExport");
  const errorText = useErrorText();
  const status = useExportStatus(job.id);
  const [downloading, setDownloading] = useState(false);

  if (status.isError) return <span className="text-xs text-destructive">{errorText(status.error)}</span>;
  if (!status.data || status.data.state === "QUEUED") {
    return (
      <Badge variant="secondary">
        <Spinner data-icon="inline-start" />
        {t("state.QUEUED")}
      </Badge>
    );
  }
  const e = status.data;
  if (e.state === "FAILED") {
    const known = (REPORT_EXPORT_FAILURE_CODES as readonly string[]).includes(e.failureCode ?? "");
    return <span className="text-xs text-destructive">{known ? t(`failure.${e.failureCode as (typeof REPORT_EXPORT_FAILURE_CODES)[number]}`) : t("failure.other")}</span>;
  }
  if (e.state === "EXPIRED") return <Badge variant="secondary">{t("state.EXPIRED")}</Badge>;
  return (
    <>
      {e.expiresAt && <span className="text-xs text-muted-foreground">{t("availableUntil", { date: formatDateTime(e.expiresAt) })}</span>}
      <Button
        size="sm"
        disabled={downloading}
        onClick={() => {
          setDownloading(true);
          downloadReportExport(job.id)
            .then((csv) => saveCsv(csv, reportExportFileName(job.kind, job.range)))
            .catch((error: unknown) => {
              toast.error(errorText(error));
              void status.refetch();
            })
            .finally(() => setDownloading(false));
        }}
      >
        {downloading ? <Spinner data-icon="inline-start" /> : <DownloadIcon data-icon="inline-start" />}
        {t("download")}
      </Button>
    </>
  );
}
