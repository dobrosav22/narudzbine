import type { Order, OrderStatus, VendorOrderStatusConfig } from '../types';

/**
 * [assumed] The contract has no human-facing order number; until the backend
 * adds one, show the id without its prefix. One place to change.
 */
export function orderNumber(order: Pick<Order, 'id'>): string {
  return order.id.replace(/^ord_/, '').toUpperCase();
}

export type StepState = 'done' | 'current' | 'upcoming';

export interface TrackerView {
  /** The vendor's happy-path statuses in their configured order (no hardcoded stepper — 01 §5). */
  steps: { status: OrderStatus; state: StepState }[];
  current?: OrderStatus;
  /** Set when the order is in a cancelled status; steps are then all 'upcoming'. */
  cancelled?: OrderStatus;
}

export function trackerView(config: VendorOrderStatusConfig, statusKey: string): TrackerView {
  const current = config.statuses.find((s) => s.key === statusKey);
  const happy = config.statuses.filter((s) => !s.isCancelled);
  if (!current || current.isCancelled) {
    return { steps: happy.map((status) => ({ status, state: 'upcoming' })), current, cancelled: current?.isCancelled ? current : undefined };
  }
  const at = happy.findIndex((s) => s.key === statusKey);
  return {
    current,
    steps: happy.map((status, i) => ({ status, state: i < at ? 'done' : i === at ? 'current' : 'upcoming' })),
  };
}
