"use client";

import { useEffect, useState } from "react";
import { EyeIcon, ShieldCheckIcon, TimerIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDateTime, formatNumber, isFilledWithin, supportTimeLeft, type Organization, type SupportAccess } from "@repo/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGuarded } from "@/features/auth/reauth";
import { MutationError, REASON_MAX, ReasonField } from "./parts";
import { useCreateSupportAccess } from "./queries";
import { forgetSupportContext, rememberSupportContext, useSupportContext } from "./support-context";
import { SupportAgreedPrices, SupportOrders, SupportProducts, SupportPromotions, SupportReport } from "./support-reads";

/*
 * Reason-scoped commercial support (createSupportAccess + the eight adminRead routes). A
 * context binds this administrator to one organization for exactly 30 minutes; every
 * successful read is audited with it. Read-only: no impersonation, no commercial writes and no
 * exports. Contexts live in memory for this tab only and are never extended — a new reason or
 * case needs a new context.
 */

export function SupportPanel({ org }: { org: Organization }) {
  const ctx = useSupportContext(org.id);
  return ctx ? <SupportSession org={org} ctx={ctx} /> : <StartSupport org={org} />;
}

function StartSupport({ org }: { org: Organization }) {
  const t = useTranslations("admin.support");
  const ta = useTranslations("admin");
  const guarded = useGuarded();
  const create = useCreateSupportAccess();
  const [reason, setReason] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const valid = isFilledWithin(reason, REASON_MAX) && isFilledWithin(caseRef, 100);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || create.isPending) return;
    try {
      const access = await guarded(() => create.mutateAsync({ organizationId: org.id, reason: reason.trim(), caseReference: caseRef.trim() }));
      rememberSupportContext(access);
    } catch {
      // Inline error.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          {t("startTitle")}
        </CardTitle>
        <CardDescription>{t("startDescription", { name: org.displayName })}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="support-case">{t("caseReference")}</FieldLabel>
              <Input id="support-case" value={caseRef} maxLength={100} autoComplete="off" onChange={(e) => setCaseRef(e.target.value)} required />
              <FieldDescription>{t("caseReferenceHint")}</FieldDescription>
            </Field>
            <ReasonField id="support-reason" label={ta("reason")} hint={t("reasonHint")} value={reason} onChange={setReason} />
          </FieldGroup>
          <MutationError error={create.error} />
          <div>
            <Button type="submit" disabled={!valid || create.isPending}>
              {create.isPending ? <Spinner data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
              {t("start")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SupportSession({ org, ctx }: { org: Organization; ctx: SupportAccess }) {
  const t = useTranslations("admin.support");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      if (supportTimeLeft(ctx.expiresAt) === 0) forgetSupportContext(org.id);
    }, 15_000);
    return () => clearInterval(id);
  }, [ctx.expiresAt, org.id]);
  const minutes = Math.max(1, Math.ceil(supportTimeLeft(ctx.expiresAt, now) / 60_000));
  const vendor = org.type === "VENDOR";

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <TimerIcon />
        <AlertTitle>{t("activeTitle")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <p>{t("activeDescription", { time: formatDateTime(ctx.expiresAt), minutes, minutesText: formatNumber(minutes) })}</p>
          <Button variant="outline" size="sm" onClick={() => forgetSupportContext(org.id)}>
            {t("end")}
          </Button>
        </AlertDescription>
      </Alert>
      <Tabs defaultValue="report" className="gap-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="report">{t("tabs.report")}</TabsTrigger>
          <TabsTrigger value="orders">{t("tabs.orders")}</TabsTrigger>
          {vendor && <TabsTrigger value="products">{t("tabs.products")}</TabsTrigger>}
          {vendor && <TabsTrigger value="promotions">{t("tabs.promotions")}</TabsTrigger>}
          {vendor && <TabsTrigger value="agreed">{t("tabs.agreed")}</TabsTrigger>}
        </TabsList>
        <TabsContent value="report">
          <SupportReport org={org} accessId={ctx.id} />
        </TabsContent>
        <TabsContent value="orders">
          <SupportOrders org={org} accessId={ctx.id} />
        </TabsContent>
        {vendor && (
          <TabsContent value="products">
            <SupportProducts org={org} accessId={ctx.id} />
          </TabsContent>
        )}
        {vendor && (
          <TabsContent value="promotions">
            <SupportPromotions org={org} accessId={ctx.id} />
          </TabsContent>
        )}
        {vendor && (
          <TabsContent value="agreed">
            <SupportAgreedPrices org={org} accessId={ctx.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
