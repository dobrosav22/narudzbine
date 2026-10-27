import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';
import { CircleUser, ClipboardList, LayoutDashboard, Package, Plus, Users } from 'lucide-react-native';
import { unreadBadge } from '@repo/core';
import { tabScreenOptions } from '@/components/tab-options';
import { useUnreadNotifications } from '@/features/account/queries';
import { useBusiness } from '@/lib/session';
import { useTokenColors } from '@/theme';
import { useT } from '@/lib/i18n';

/** Vendor shell: dashboard, catalogue, orders, buyers, account (with the unread inbox count). */
export default function VendorTabs() {
  const c = useTokenColors();
  const t = useT('mTabs');
  const { organization } = useBusiness();
  const unread = useUnreadNotifications();
  const badge = unread.data ? unreadBadge(unread.data.count, unread.data.more) : null;
  return (
    <Tabs screenOptions={tabScreenOptions(c)}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          headerTitle: organization.displayName,
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="catalogue"
        options={{
          title: t('catalogue'),
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
          // The plan's product cap is enforced on save (PLAN_LIMIT_EXCEEDED), shown by the editor.
          headerRight: () => (
            <Link href="/vendor/product/new" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={t('addProduct')} hitSlop={8} className="mr-4">
                <Plus color={c.primary} size={24} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen name="orders" options={{ title: t('orders'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }} />
      <Tabs.Screen name="buyers" options={{ title: t('buyers'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size} />,
          tabBarBadge: badge ?? undefined,
          tabBarBadgeStyle: { backgroundColor: c.primary, color: c['primary-foreground'], fontFamily: 'Geist_500Medium' },
        }}
      />
    </Tabs>
  );
}
