"use client";

import { useTranslations } from "next-intl";
import { useBusiness } from "@/lib/session";
import { LocationsPanel } from "./locations-panel";
import { PageFrame } from "./parts";
import { TeamPanel } from "./team-panel";

/** Vendor nav has its own Team and Locations entries; buyers reach the same panels under Settings. */
export function TeamPage() {
  const t = useTranslations("nav");
  const { organization } = useBusiness();
  return (
    <PageFrame title={t("team")} subtitle={organization.displayName}>
      <TeamPanel />
    </PageFrame>
  );
}

export function LocationsPage() {
  const t = useTranslations("nav");
  const { organization } = useBusiness();
  return (
    <PageFrame title={t("locations")} subtitle={organization.displayName}>
      <LocationsPanel />
    </PageFrame>
  );
}
