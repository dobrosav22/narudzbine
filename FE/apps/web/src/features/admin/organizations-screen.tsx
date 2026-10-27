"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2Icon, MailPlusIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, formatNumber, ORGANIZATION_STATES, type Country, type Organization } from "@repo/core";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CountryText, FilterSelect, OrgStateBadge, OrgTypeBadge, PageHeader, Pager } from "./parts";
import { useAdminOrganizations } from "./queries";
import { InviteOrganizationDialog, SetupInvitationsCard } from "./setup-invitations";

const PAGE_SIZE = 25;

/** Typing settles for 300 ms before the search is sent. */
function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** Directory of every buyer and vendor organization in both countries (adminListOrganizations). */
export function AdminOrganizationsScreen() {
  const t = useTranslations("admin");
  const router = useRouter();
  const [q, setQ] = useState("");
  const [type, setType] = useState<Organization["type"] | "">("");
  const [country, setCountry] = useState<Country | "">("");
  const [state, setState] = useState<Organization["state"] | "">("");
  const [page, setPage] = useState(0);
  const [inviting, setInviting] = useState(false);
  const search = useDebounced(q.trim());

  const query = {
    page,
    size: PAGE_SIZE,
    includeTotal: true,
    ...(search ? { q: search } : {}),
    ...(type ? { type } : {}),
    ...(country ? { country } : {}),
    ...(state ? { state } : {}),
  };
  const list = useAdminOrganizations(query);
  const filtered = Boolean(search || type || country || state);

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(0);
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("organizations.title")}
        description={
          list.data?.total != null ? t("organizations.count", { count: list.data.total, countText: formatNumber(list.data.total) }) : t("organizations.subtitle")
        }
        actions={
          <Button onClick={() => setInviting(true)}>
            <MailPlusIcon data-icon="inline-start" />
            {t("invite.open")}
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            maxLength={100}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder={t("organizations.search")}
            aria-label={t("organizations.search")}
          />
        </InputGroup>
        <FilterSelect
          label={t("organizations.type")}
          value={type}
          onChange={reset(setType)}
          options={[
            { value: "VENDOR", label: t("orgType.VENDOR") },
            { value: "BUYER", label: t("orgType.BUYER") },
          ]}
          allLabel={t("organizations.allTypes")}
        />
        <FilterSelect
          label={t("organizations.country")}
          value={country}
          onChange={reset(setCountry)}
          options={[
            { value: "RS", label: t("country.RS") },
            { value: "BA", label: t("country.BA") },
          ]}
          allLabel={t("organizations.allCountries")}
          className="w-48"
        />
        <FilterSelect
          label={t("organizations.state")}
          value={state}
          onChange={reset(setState)}
          options={ORGANIZATION_STATES.map((s) => ({ value: s, label: t(`orgState.${s}`) }))}
          allLabel={t("organizations.allStates")}
        />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <RowsSkeleton rows={6} />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          icon={Building2Icon}
          title={filtered ? t("organizations.noMatches") : t("organizations.none")}
          description={filtered ? undefined : t("organizations.noneDescription")}
        />
      ) : (
        <Card>
          <CardContent>
            <Table className="text-sm" aria-label={t("organizations.title")}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("organizations.name")}</TableHead>
                  <TableHead>{t("organizations.type")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("organizations.country")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t("organizations.registration")}</TableHead>
                  <TableHead>{t("organizations.state")}</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">{t("organizations.created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.items.map((org) => (
                  <TableRow key={org.id} className="cursor-pointer" onClick={() => router.push(`/admin/organizations/${org.id}`)}>
                    <TableCell className="whitespace-normal">
                      <Link href={`/admin/organizations/${org.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {org.displayName}
                      </Link>
                      {org.legalName !== org.displayName && <div className="text-xs text-muted-foreground">{org.legalName}</div>}
                    </TableCell>
                    <TableCell>
                      <OrgTypeBadge type={org.type} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <CountryText country={org.country} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs">{org.registrationIdentifier}</TableCell>
                    <TableCell>
                      <OrgStateBadge state={org.state} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right">{formatDate(org.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager page={page} size={PAGE_SIZE} total={list.data.total} count={list.data.items.length} onPage={setPage} />
          </CardContent>
        </Card>
      )}

      <SetupInvitationsCard />
      <InviteOrganizationDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}
