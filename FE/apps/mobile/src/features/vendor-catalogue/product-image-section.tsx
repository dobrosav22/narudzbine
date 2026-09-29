import { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import { MAX_PRODUCT_IMAGE_MB, productImageProblem, services, type Msg } from '@repo/core';
import { ProductImage } from '@/components/product-image';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { useErrorText, useMsg, useT } from '@/lib/i18n';

/** Some platforms leave mimeType out of the picker result; fall back to the file extension. */
function mimeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split('?')[0]!.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Product image on mobile — mirrors web's ProductImageCard. Picks from the photo library
 * (no permission prompt needed for the system picker), uploads at once, and puts the
 * returned URL in the draft; it's saved with the rest of the product.
 */
export function ProductImageSection({
  vendorOrgId,
  productName,
  value,
  onChange,
}: {
  vendorOrgId: string;
  productName: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const t = useT('productEditor.image');
  const tmo = useT('m.image');
  const tm = useMsg();
  const errorText = useErrorText();
  const [problem, setProblem] = useState<Msg>();
  const upload = useMutation({
    mutationFn: (asset: ImagePicker.ImagePickerAsset) =>
      services.catalogue.uploadProductImage({ vendorOrgId, uri: asset.uri, mimeType: mimeOf(asset), sizeBytes: asset.fileSize }),
    onSuccess: ({ url }) => onChange(url),
  });
  const error = problem ? tm(problem) : upload.error ? errorText(upload.error) : undefined;

  const pick = async () => {
    upload.reset();
    setProblem(undefined);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const why = productImageProblem({ mimeType: mimeOf(asset), sizeBytes: asset.fileSize });
    if (why) setProblem(why);
    else upload.mutate(asset);
  };

  return (
    <Card>
      <CardHeader title={t('title')} description={tmo('description', { mb: MAX_PRODUCT_IMAGE_MB })} />
      <ProductImage
        src={value || undefined}
        className="w-full rounded-lg"
        style={{ aspectRatio: 4 / 3 }}
        accessibilityLabel={value ? t('alt', { name: productName || t('thisProduct') }) : undefined}
      />
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" loading={upload.isPending} onPress={() => void pick()}>
          {value ? tmo('replace') : tmo('choose')}
        </Button>
        {value ? (
          <Button
            variant="ghost"
            disabled={upload.isPending}
            onPress={() => {
              setProblem(undefined);
              onChange('');
            }}>
            {t('remove')}
          </Button>
        ) : null}
      </View>
      <FieldError>{error}</FieldError>
    </Card>
  );
}
