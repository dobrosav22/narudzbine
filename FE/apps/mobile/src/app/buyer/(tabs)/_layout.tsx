import { Tabs } from 'expo-router';
import { CircleUser, ClipboardList, Heart, ShoppingCart, Store } from 'lucide-react-native';
import { formatNumber, unreadBadge } from '@repo/core';
import { tabScreenOptions } from '@/components/tab-options';
import { useUnreadNotifications } from '@/features/account/queries';
import { VendorHeaderSwitcher } from '@/features/buyer-catalogue/vendor-header';
import { useCart } from '@/lib/cart';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/** Buyer shell. The header shows the active vendor (switcher owned by the buyer catalogue area). */
export default function BuyerTabs() {
  const c = useTokenColors();
  const t = useT('mTabs');
  const { itemCount } = useCart();
  const unread = useUnreadNotifications();
  const badge = unread.data ? unreadBadge(unread.data.count, unread.data.more) : null;
  const badgeStyle = { backgroundColor: c.primary, color: c['primary-foreground'], fontFamily: 'Geist_500Medium' };
  return (
    <Tabs screenOptions={{ ...tabScreenOptions(c), headerTitle: () => <VendorHeaderSwitcher /> }}>
      <Tabs.Screen name="index" options={{ title: t('home'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }} />
      <Tabs.Screen name="favorites" options={{ title: t('favorites'), tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('cart'),
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
          tabBarBadge: itemCount ? formatNumber(itemCount) : undefined,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
      <Tabs.Screen name="orders" options={{ title: t('orders'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} />,
          tabBarBadge: badge ?? undefined,
          tabBarBadgeStyle: badgeStyle,
        }}
      />
    </Tabs>
  );
}
