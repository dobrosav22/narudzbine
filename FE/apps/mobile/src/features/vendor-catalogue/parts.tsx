import { useCallback, useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Package } from 'lucide-react-native';
import { apiConfig, assetContentUrl, catalogueProblemMsg, stockStatus, type Product, type Stock } from '@repo/core';
import { Badge } from '@/components/ui/badge';
import { AppText } from '@/components/app-text';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';

/** Error text for catalogue, pricing, media and inventory calls (adds this area's problem codes). */
export function useCatalogueErrorText() {
  const tm = useMsg();
  return useCallback((error: unknown) => tm(catalogueProblemMsg(error)), [tm]);
}

export function CatalogueFormError({ error }: { error: unknown }) {
  const errorText = useCatalogueErrorText();
  if (!error) return null;
  return (
    <View accessibilityRole="alert" className="rounded-lg border border-border bg-card p-3">
      <AppText className="text-sm text-destructive">{errorText(error)}</AppText>
    </View>
  );
}

const STATE_BADGE = { ACTIVE: 'success', INACTIVE: 'secondary', ARCHIVED: 'outline' } as const;

export function ProductStateBadge({ state }: { state: Product['state'] }) {
  const t = useT('vendorCatalogue.state');
  return <Badge variant={STATE_BADGE[state]}>{t(state)}</Badge>;
}

const STOCK_BADGE = { absent: 'outline', stale: 'warning', current: 'success' } as const;

export function StockStatusBadge({ stock }: { stock: Stock | undefined }) {
  const t = useT('invInventory.stock');
  const status = stockStatus(stock);
  if (status === 'unknown') return null;
  return <Badge variant={STOCK_BADGE[status]}>{t(status)}</Badge>;
}

/** The stored native bearer, for image requests that bypass the API client. */
function useBearer(): string | null | undefined {
  const [bearer, setBearer] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void Promise.resolve(apiConfig().getBearer?.() ?? null).then((b) => alive && setBearer(b));
    return () => {
      alive = false;
    };
  }, []);
  return bearer;
}

/**
 * Authenticated product image (GET /media/assets/{id}/content with the bearer header), or a
 * neutral placeholder when there is none or it fails. The content is private, so it is cached
 * in memory only.
 */
export function AssetImage({
  assetId,
  className,
  style,
  accessibilityLabel,
}: {
  assetId: string | undefined;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useTokenColors();
  const bearer = useBearer();
  const [failed, setFailed] = useState<string | null>(null);
  const show = !!assetId && bearer !== undefined && failed !== assetId;
  return (
    <View
      className={`items-center justify-center overflow-hidden rounded-md bg-muted ${className ?? ''}`}
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}>
      {show ? (
        <Image
          source={{ uri: assetContentUrl(assetId), headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined }}
          cachePolicy="memory"
          contentFit="cover"
          style={{ width: '100%', height: '100%' }}
          onError={() => setFailed(assetId)}
        />
      ) : (
        <Package size={20} color={c['muted-foreground']} />
      )}
    </View>
  );
}
