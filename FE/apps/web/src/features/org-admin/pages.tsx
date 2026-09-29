"use client";

import { SectionHeader } from "@/components/section-nav";
import { StatusSettings } from "@/features/vendor-orders/status-settings";
import { useSignedIn } from "@/lib/session";
import { AccountNav, SettingsNav } from "./navs";
import { CompanyPanel } from "./company-panel";
import { LocationsPanel } from "./locations-panel";
import { NotificationsPanel, ProfilePanel } from "./account-panels";
import { PlanPanel } from "./plan-panel";
import { TeamPanel } from "./team-panel";
import { useTranslations } from "next-intl";

// Pages for Phase 7's admin areas. Route files render one of these; the header and
// section nav are shared per area so every section of it looks the same.

function Page({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function SettingsPage({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const { membership } = useSignedIn();
  return (
    <Page>
      <SectionHeader title={t("settings")} subtitle={membership.org.name} nav={<SettingsNav orgType={membership.orgType} />} />
      {children}
    </Page>
  );
}

function AccountPage({ children }: { children: React.ReactNode }) {
  const t = useTranslations("nav");
  const { membership, session } = useSignedIn();
  return (
    <Page>
      <SectionHeader title={t("account")} subtitle={session.email} nav={<AccountNav orgType={membership.orgType} />} />
      {children}
    </Page>
  );
}

export function LocationsPage() {
  const t = useTranslations("nav");
  const { membership } = useSignedIn();
  return (
    <Page>
      <SectionHeader title={t("locations")} subtitle={membership.org.name} />
      <LocationsPanel orgType={membership.orgType} orgId={membership.org.id} />
    </Page>
  );
}

export function TeamPage() {
  const t = useTranslations("nav");
  const { membership } = useSignedIn();
  return (
    <Page>
      <SectionHeader title={t("team")} subtitle={membership.org.name} />
      <TeamPanel membership={membership} />
    </Page>
  );
}

export function CompanySettingsPage() {
  const { membership } = useSignedIn();
  return (
    <SettingsPage>
      <CompanyPanel orgType={membership.orgType} orgId={membership.org.id} />
    </SettingsPage>
  );
}

export function StatusSettingsPage() {
  const { membership } = useSignedIn();
  return (
    <SettingsPage>
      <StatusSettings vendorOrgId={membership.org.id} />
    </SettingsPage>
  );
}

export function PlanSettingsPage() {
  const { membership } = useSignedIn();
  return (
    <SettingsPage>
      <PlanPanel vendorOrgId={membership.org.id} />
    </SettingsPage>
  );
}

export function BuyerLocationsSettingsPage() {
  const { membership } = useSignedIn();
  return (
    <SettingsPage>
      <LocationsPanel orgType="buyer" orgId={membership.org.id} />
    </SettingsPage>
  );
}

export function BuyerTeamSettingsPage() {
  const { membership } = useSignedIn();
  return (
    <SettingsPage>
      <TeamPanel membership={membership} />
    </SettingsPage>
  );
}

export function ProfilePage() {
  const { membership, session } = useSignedIn();
  return (
    <AccountPage>
      <ProfilePanel membership={membership} email={session.email} />
    </AccountPage>
  );
}

export function NotificationsPage() {
  const { membership } = useSignedIn();
  return (
    <AccountPage>
      <NotificationsPanel membership={membership} />
    </AccountPage>
  );
}
