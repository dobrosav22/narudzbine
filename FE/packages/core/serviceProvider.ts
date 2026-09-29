import type { AppServices } from './services';
import * as mocks from './mocks';
import * as real from './services/real'; // stub folder — every method rejects with NOT_IMPLEMENTED

import { USE_MOCKS } from './config'; // env wiring for the mock/real switch lives there

export function createServices(useMocks: boolean): AppServices {
  const impl = useMocks ? mocks : real;
  return {
    auth: impl.authService,
    vendorOrgs: impl.vendorOrgsService,
    buyerOrgs: impl.buyerOrgsService,
    subscription: impl.subscriptionService,
    locations: impl.locationsService,
    team: impl.teamService,
    buyers: impl.buyersService,
    invites: impl.invitesService,
    catalogue: impl.catalogueService,
    pricing: impl.pricingService,
    merchandising: impl.merchandisingService,
    orders: impl.ordersService,
    orderStatusConfig: impl.orderStatusConfigService,
    favorites: impl.favoritesService,
    draftCarts: impl.draftCartsService,
    notifications: impl.notificationsService,
    stats: impl.statsService,
    admin: impl.adminService,
    preferences: impl.preferencesService,
  };
}

export { USE_MOCKS };

if (!USE_MOCKS) {
  console.warn(
    '[@repo/core] USE_MOCKS=false — using real services. Any service without a real ' +
      'implementation will reject with NOT_IMPLEMENTED; there is no fallback to mock data.',
  );
}

/** The only thing screens import to reach data. */
export const services: AppServices = createServices(USE_MOCKS);
