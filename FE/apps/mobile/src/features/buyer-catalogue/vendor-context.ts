import { useEffect } from 'react';
import { resolveActiveVendor } from '@repo/core';
import { sessionStore, useSession } from '@/lib/session';
import { useConnectedVendors } from './queries';

/**
 * The buyer's vendor context: connected vendors (ACTIVE relationships + partner names) and the
 * one whose catalogue is open. The remembered vendor is kept while still connected; otherwise the
 * first connected vendor is selected automatically (or none when there are no connections).
 * UI context only — it is never sent as authorization.
 */
export function useVendorContext() {
  const session = useSession();
  const isBuyer = session.status === 'business' && session.organization.type === 'BUYER';
  const activeVendorId = session.status === 'business' ? session.activeVendorId : null;
  const vendors = useConnectedVendors();
  const active = vendors.data ? resolveActiveVendor(vendors.data, activeVendorId) : null;
  const resolvedId = active?.vendorId ?? null;

  useEffect(() => {
    if (isBuyer && vendors.data && resolvedId !== activeVendorId) void sessionStore.selectVendor(resolvedId);
  }, [isBuyer, vendors.data, resolvedId, activeVendorId]);

  return {
    vendors: vendors.data ?? [],
    /** Null while loading, on error and when the buyer has no connected vendor. */
    active,
    isPending: vendors.isPending,
    error: vendors.error,
    refetch: vendors.refetch,
  };
}
