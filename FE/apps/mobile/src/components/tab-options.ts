import type { ColorTokenMap } from '@/theme';

/** Shared tab bar styling: active tab = primary violet (05 §4 "active nav items"). */
export function tabScreenOptions(c: ColorTokenMap) {
  return {
    tabBarActiveTintColor: c.primary,
    tabBarInactiveTintColor: c['muted-foreground'],
    tabBarLabelStyle: { fontFamily: 'Geist_500Medium' },
    tabBarStyle: { backgroundColor: c.background, borderTopColor: c.border },
    headerTitleStyle: { fontFamily: 'Geist_600SemiBold' },
    headerStyle: { backgroundColor: c.background },
    headerShadowVisible: true,
  } as const;
}
