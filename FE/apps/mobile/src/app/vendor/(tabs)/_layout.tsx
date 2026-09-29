import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { CircleUser, ClipboardList, LayoutDashboard, Package, Plus, Users } from 'lucide-react-native';
import { isAtLimit } from '@repo/core';
import { tabScreenOptions } from '@/components/tab-options';
import { useVendorPlan } from '@/features/vendor-catalogue/queries';
import { useSignedIn } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/**
 * Vendor shell — 03 → "Navigation shape". Home is the dashboard; Stats and Featured &
 * promotions are pushed from it (five tabs is the comfortable maximum on a phone).
 */
export default function VendorTabs() {
  const c = useTokenColors();
  const t = useT('m.tabs');
  const { membership } = useSignedIn();
  // v1.1 hard block (01 §2): usage is checked before Add Product; at or over the limit it's disabled.
  const plan = useVendorPlan(membership.org.id);
  const canAdd = !!plan.data && !isAtLimit(plan.data, 'products');
  return (
    <Tabs screenOptions={tabScreenOptions(c)}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          headerTitle: membership.org.name,
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="catalogue"
        options={{
          title: t('catalogue'),
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
          headerRight: () =>
            canAdd ? (
              <Link href="/vendor/product/new" asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={t('addProduct')} hitSlop={8} className="mr-4">
                  <Plus color={c.primary} size={24} />
                </Pressable>
              </Link>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t('addProduct')} aria-disabled disabled hitSlop={8} className="mr-4">
                <Plus color={c['muted-foreground']} size={24} />
              </Pressable>
            ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('orders'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="buyers"
        options={{ title: t('buyers'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('account'), tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} /> }}
      />
    </Tabs>
  );
}
