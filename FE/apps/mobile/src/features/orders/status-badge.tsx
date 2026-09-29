import { findStatus, statusLabel, statusTone, type VendorOrderStatusConfig } from '@repo/core';
import { Badge } from '@/components/ui/badge';
import { useMsg } from '@/lib/i18n';

/** Vendor-configured status, coloured by its flags (05 §1: semantic colours, never purple). */
export function StatusBadge({ config, statusKey }: { config: VendorOrderStatusConfig | undefined; statusKey: string }) {
  const tm = useMsg();
  const status = findStatus(config, statusKey);
  return <Badge variant={statusTone(status)}>{tm(statusLabel(status, statusKey))}</Badge>;
}
