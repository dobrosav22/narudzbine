import { useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { Package } from 'lucide-react-native';
import { useTokenColors } from '@/theme';

/**
 * A product's picture (Product.imageUrl) or a neutral placeholder when there is none or it
 * fails to load. Mirrors web's ProductImage. Size/shape via className ("size-12") or style
 * ({ aspectRatio: 4 / 3 }). Decorative by default — the product name is always beside it.
 */
export function ProductImage({
  src,
  className,
  style,
  accessibilityLabel,
}: {
  src: string | undefined;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  return (
    <View
      className={`items-center justify-center overflow-hidden rounded-md bg-muted ${className ?? ''}`}
      style={style}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      testID="product-image">
      {/* Keyed by src so a new picture gets a fresh load/error state. */}
      <Picture key={src ?? 'none'} src={src} />
    </View>
  );
}

function Picture({ src }: { src: string | undefined }) {
  const c = useTokenColors();
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Package size={20} color={c['muted-foreground']} />;
  return <Image source={{ uri: src }} resizeMode="cover" style={{ width: '100%', height: '100%' }} onError={() => setFailed(true)} />;
}
