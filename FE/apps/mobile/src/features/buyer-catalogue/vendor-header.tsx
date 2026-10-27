import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { AppText } from '@/components/app-text';
import { useT } from '@/lib/i18n';
import { useTokenColors } from '@/theme';
import { useVendorContext } from './vendor-context';

/**
 * Header title for the buyer tabs (rendered by the tabs layout): the active vendor, opening the
 * /switch-vendor modal when the buyer has 2+ connected vendors. Rendering it also keeps the
 * remembered vendor valid (auto-selects the first connected vendor).
 */
export function VendorHeaderSwitcher() {
  const c = useTokenColors();
  const t = useT('browse');
  const { vendors, active, isPending } = useVendorContext();
  const label = (
    <View className="gap-0.5">
      <AppText className="text-xs text-muted-foreground">{t('orderingFrom')}</AppText>
      <AppText weight="semibold" className="text-base text-foreground" numberOfLines={1}>
        {isPending ? '…' : active?.displayName ?? t('noVendorsYet')}
      </AppText>
    </View>
  );
  if (vendors.length < 2) return label;
  return (
    <Link href="/switch-vendor" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={t('switchVendor')} className="flex-row items-center gap-1.5">
        {label}
        <ChevronDown size={16} color={c['muted-foreground']} />
      </Pressable>
    </Link>
  );
}
