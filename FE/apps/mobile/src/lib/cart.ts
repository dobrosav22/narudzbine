import { useEffect, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartItemCount, createCartStore, type CartScope, type CartState } from '@repo/core';
import { useSignedIn } from './session';

/**
 * Same store as apps/web — logic in @repo/core. Carts aren't secrets and can
 * outgrow SecureStore's ~2 KB values, so they live in AsyncStorage (localStorage
 * on the web export); only the session token uses SecureStore.
 */
export const cartStore = createCartStore({
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
});

const NO_CART: CartState = { lines: [] };

/** The live cart for the signed-in buyer's active vendor (02 → "Cart context"). */
export function useCart() {
  const { membership, activeVendor } = useSignedIn();
  const scope: CartScope | undefined = useMemo(
    () =>
      membership.orgType === 'buyer' && activeVendor
        ? { buyerOrgId: membership.org.id, vendorOrgId: activeVendor.id }
        : undefined,
    [membership, activeVendor],
  );

  useEffect(() => {
    if (scope) void cartStore.hydrate(scope);
  }, [scope]);

  const state = useSyncExternalStore(cartStore.subscribe, () => (scope ? cartStore.getState(scope) : NO_CART), () => NO_CART);

  return useMemo(
    () => ({
      scope,
      state,
      lines: state.lines,
      itemCount: cartItemCount(state.lines),
      quantityOf: (productId: string) => state.lines.find((l) => l.productId === productId)?.quantity ?? 0,
      add: (productId: string, quantity: number) => scope && cartStore.add(scope, productId, quantity),
      setQuantity: (productId: string, quantity: number) => scope && cartStore.setQuantity(scope, productId, quantity),
      remove: (productId: string) => scope && cartStore.remove(scope, productId),
      setLocation: (locationId: string) => scope && cartStore.setLocation(scope, locationId),
      clear: () => scope && cartStore.clear(scope),
    }),
    [scope, state],
  );
}
