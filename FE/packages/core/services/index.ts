import type { AuthService } from './auth';
import type {
  BuyerOrgsService,
  BuyersService,
  LocationsService,
  SubscriptionService,
  TeamService,
  VendorOrgsService,
} from './orgs';
import type { InvitesService } from './invites';
import type { CatalogueService } from './catalogue';
import type { PricingService } from './pricing';
import type { MerchandisingService } from './merchandising';
import type { OrdersService, OrderStatusConfigService } from './orders';
import type { DraftCartsService, FavoritesService } from './buyer';
import type { NotificationsService } from './notifications';
import type { StatsService } from './stats';
import type { AdminService } from './admin';
import type { PreferencesService } from './preferences';

export type * from './auth';
export type * from './orgs';
export type * from './invites';
export type * from './catalogue';
export type * from './pricing';
export type * from './merchandising';
export type * from './orders';
export type * from './buyer';
export type * from './notifications';
export type * from './stats';
export type * from './admin';
export type * from './preferences';

/**
 * Everything a screen can call. Both `mocks` and `services/real` must satisfy
 * this exactly — serviceProvider.ts type-checks each against it.
 */
export interface AppServices {
  auth: AuthService;
  vendorOrgs: VendorOrgsService;
  buyerOrgs: BuyerOrgsService;
  subscription: SubscriptionService;
  locations: LocationsService;
  team: TeamService;
  buyers: BuyersService;
  invites: InvitesService;
  catalogue: CatalogueService;
  pricing: PricingService;
  merchandising: MerchandisingService;
  orders: OrdersService;
  orderStatusConfig: OrderStatusConfigService;
  favorites: FavoritesService;
  draftCarts: DraftCartsService;
  notifications: NotificationsService;
  stats: StatsService;
  /** v1.1: Platform Admin (web-only). */
  admin: AdminService;
  /** v1.1: per-user UI language (01 §12). */
  preferences: PreferencesService;
}
