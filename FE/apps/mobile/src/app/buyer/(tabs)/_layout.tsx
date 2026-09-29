import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BarChart3, ChevronDown, CircleUser, ClipboardList, Heart, ShoppingCart, Store } from 'lucide-react-native';
import { formatNumber } from '@repo/core';
import { AppText } from '@/components/app-text';
import { tabScreenOptions } from '@/components/tab-options';
import { useCart } from '@/lib/cart';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/**
 * Buyer shell. 03: a persistent vendor switcher sits above the shell when the
 * buyer has 2+ vendors — here, the header title on every tab.
 */
export default function BuyerTabs() {
  const c = useTokenColors();
  const t = useT('m.tabs');
  const { itemCount } = useCart();
  return (
    <Tabs screenOptions={{ ...tabScreenOptions(c), headerTitle: () => <VendorHeaderSwitcher /> }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('home'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{ title: t('favorites'), tabBarIcon: ({ color, size }) => <Heart color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('cart'),
          tabBarIcon: ({ color, size }) => <ShoppingCart color={color} size={size} />,
          // Live item count; violet like other "active" moments (05 §4).
          tabBarBadge: itemCount ? formatNumber(itemCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: c.primary, color: c['primary-foreground'], fontFamily: 'Geist_500Medium' },
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t('orders'),
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
          // Own stats (03) live one tap from order history; the tab bar is already full.
          headerRight: () => (
            <Link href="/buyer/stats" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={t('yourStats')} hitSlop={8} className="mr-4">
                <BarChart3 color={c.primary} size={22} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('account'), tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} /> }}
      />
    </Tabs>
  );
}

function VendorHeaderSwitcher() {
  const c = useTokenColors();
  const t = useT('m.tabs');
  const { connectedVendors, activeVendor } = useSignedIn();
  const label = (
    <View className="gap-0.5">
      <AppText className="text-xs text-muted-foreground">{t('orderingFrom')}</AppText>
      <AppText weight="semibold" className="text-base text-foreground">
        {activeVendor?.name ?? t('noVendors')}
      </AppText>
    </View>
  );
  if (connectedVendors.length < 2) return label;
  return (
    <Link href="/switch-vendor" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={t('switchVendor')} className="flex-row items-center gap-1.5">
        {label}
        <ChevronDown size={16} color={c['muted-foreground']} />
      </Pressable>
    </Link>
  );
}
