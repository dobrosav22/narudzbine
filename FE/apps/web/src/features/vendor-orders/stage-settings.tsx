"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, ArchiveIcon, CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  canConfigureStages,
  codePointLength,
  isDuplicateStageName,
  isUncertainOutcome,
  isValidText,
  moveStageId,
  sortedStages,
  STAGE_LIMIT,
  STAGE_NAME_MAX,
  uuidv7,
  type Stage,
  type StageList,
} from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionError } from "@/features/orders/action-error";
import { ConfirmDialog } from "@/features/orders/confirm-dialog";
import { useCreateStage, useOrderStages, useRenameStage, useReorderStages, useRetireStage } from "@/features/orders/queries";
import { useBusiness } from "@/lib/session";

/**
 * /vendor/settings/stages — the vendor's optional custom order stages (labels inside ACCEPTED;
 * the core lifecycle states are fixed). Owner/admin create, rename, reorder and retire (at most 20
 * retained definitions, retired included); staff see the list read-only. Retiring is permanent.
 */
export function StageSettings() {
  const { account } = useBusiness();
  const stages = useOrderStages();
  if (stages.isError) return <ErrorState error={stages.error} onRetry={() => void stages.refetch()} />;
  if (stages.isPending) return <RowsSkeleton rows={4} />;
  return <Editor list={stages.data} editable={canConfigureStages(account.role)} />;
}

function Editor({ list, editable }: { list: StageList; editable: boolean }) {
  const t = useTranslations("ordStages");
  const ts = useTranslations("ordState");
  const ordered = sortedStages(list);
  const reorder = useReorderStages();
  const [retiring, setRetiring] = useState<Stage | null>(null);
  const retire = useRetireStage();

  const move = (index: number, delta: -1 | 1) =>
    reorder.mutate({ expectedRevision: list.revision, stageIds: moveStageId(ordered.map((s) => s.id), index, delta) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description", { accepted: ts("ACCEPTED") })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!editable && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
        {ordered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="rounded-lg border">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  {editable && <TableHead className="w-20">{t("order")}</TableHead>}
                  <TableHead>{t("name")}</TableHead>
                  <TableHead className="w-28">{t("state")}</TableHead>
                  {editable && (
                    <TableHead className="w-32">
                      <span className="sr-only">{t("actions")}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((s, i) => (
                  <StageRow
                    key={s.id}
                    stage={s}
                    stages={ordered}
                    editable={editable}
                    first={i === 0}
                    last={i === ordered.length - 1}
                    moving={reorder.isPending}
                    onMove={(delta) => move(i, delta)}
                    onRetire={() => setRetiring(s)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <ActionError error={reorder.error} />
        {editable && <NewStage stages={ordered} />}
      </CardContent>

      <ConfirmDialog
        open={!!retiring}
        onOpenChange={(o) => {
          if (!o) {
            setRetiring(null);
            retire.reset();
          }
        }}
        title={t("retireTitle", { name: retiring?.name ?? "" })}
        description={t("retireDescription")}
        confirmLabel={t("retire")}
        destructive
        pending={retire.isPending}
        error={retire.error}
        onConfirm={() =>
          retiring &&
          retire.mutate(
            { stageId: retiring.id, expectedRevision: retiring.revision },
            {
              onSuccess: (s) => {
                toast.success(t("retired", { name: s.name }));
                setRetiring(null);
              },
            },
          )
        }
      />
    </Card>
  );
}

function StageRow({
  stage,
  stages,
  editable,
  first,
  last,
  moving,
  onMove,
  onRetire,
}: {
  stage: Stage;
  stages: Stage[];
  editable: boolean;
  first: boolean;
  last: boolean;
  moving: boolean;
  onMove: (delta: -1 | 1) => void;
  onRetire: () => void;
}) {
  const t = useTranslations("ordStages");
  const rename = useRenameStage();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const duplicate = isDuplicateStageName(stages, name, stage.id);
  const valid = isValidText(name, STAGE_NAME_MAX) && !duplicate;

  const save = () => {
    if (!valid) return;
    if (name.trim() === stage.name) return setEditing(false);
    rename.mutate(
      { stageId: stage.id, expectedRevision: stage.revision, name },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(t("renamed"));
        },
      },
    );
  };

  return (
    <TableRow>
      {editable && (
        <TableCell>
          <div className="flex">
            <Button size="icon-sm" variant="ghost" aria-label={t("moveUp", { name: stage.name })} disabled={first || moving} onClick={() => onMove(-1)}>
              <ArrowUpIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={t("moveDown", { name: stage.name })} disabled={last || moving} onClick={() => onMove(1)}>
              <ArrowDownIcon />
            </Button>
          </div>
        </TableCell>
      )}
      <TableCell className="whitespace-normal">
        {editing ? (
          <form
            className="flex flex-col gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="flex items-center gap-1">
              <Input
                aria-label={t("nameOf", { name: stage.name })}
                value={name}
                aria-invalid={!valid || undefined}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <Button type="submit" size="icon-sm" variant="ghost" aria-label={t("saveName")} disabled={!valid || rename.isPending}>
                {rename.isPending ? <Spinner /> : <CheckIcon />}
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t("cancelEdit")}
                onClick={() => {
                  setEditing(false);
                  setName(stage.name);
                  rename.reset();
                }}
              >
                <XIcon />
              </Button>
            </div>
            {duplicate && <span className="text-xs text-destructive">{t("duplicate")}</span>}
            <ActionError error={rename.error} />
          </form>
        ) : (
          <span className={stage.state === "RETIRED" ? "text-muted-foreground" : "font-medium"}>{stage.name}</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant={stage.state === "ACTIVE" ? "success" : "secondary"}>{t(stage.state)}</Badge>
      </TableCell>
      {editable && (
        <TableCell>
          <div className="flex justify-end">
            {!editing && (
              <Button size="icon-sm" variant="ghost" aria-label={t("rename", { name: stage.name })} onClick={() => setEditing(true)}>
                <PencilIcon />
              </Button>
            )}
            {stage.state === "ACTIVE" && (
              <Button size="icon-sm" variant="ghost" aria-label={t("retireAria", { name: stage.name })} onClick={onRetire}>
                <ArchiveIcon />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

/** One client UUIDv7 per creation intent: reused after an uncertain outcome, renewed otherwise. */
function NewStage({ stages }: { stages: Stage[] }) {
  const t = useTranslations("ordStages");
  const tc = useTranslations("common");
  const create = useCreateStage();
  const [name, setName] = useState("");
  const [intent, setIntent] = useState<{ id: string; name: string } | null>(null);
  const full = stages.length >= STAGE_LIMIT;
  const duplicate = isDuplicateStageName(stages, name);
  const tooLong = codePointLength(name.trim()) > STAGE_NAME_MAX;
  const valid = isValidText(name, STAGE_NAME_MAX) && !duplicate && !full;

  const submit = () => {
    if (!valid || create.isPending) return;
    const body = name.trim();
    const next = intent && intent.name === body ? intent : { id: uuidv7(), name: body };
    setIntent(next);
    create.mutate(next, {
      onSuccess: (s) => {
        toast.success(t("created", { name: s.name }));
        setName("");
        setIntent(null);
      },
      onError: (e) => {
        if (!isUncertainOutcome(e)) setIntent(null);
      },
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field data-invalid={duplicate || tooLong || undefined}>
        <FieldLabel htmlFor="new-stage">{t("new")}</FieldLabel>
        <InputGroup className="max-w-md">
          <InputGroupInput
            id="new-stage"
            placeholder={t("newPlaceholder")}
            value={name}
            disabled={full}
            aria-invalid={duplicate || tooLong || undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              {tc("add")}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <FieldDescription>
          {full ? t("limitReached", { max: STAGE_LIMIT }) : duplicate ? t("duplicate") : tooLong ? t("tooLong", { max: STAGE_NAME_MAX }) : t("limit", { max: STAGE_LIMIT })}
        </FieldDescription>
        <ActionError error={create.error} />
      </Field>
    </form>
  );
}
