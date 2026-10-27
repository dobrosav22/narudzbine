import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { Star, Trash2 } from 'lucide-react-native';
import {
  assetFailureMsg,
  catalogueQueries,
  GALLERY_MAX,
  IMAGE_MAX_BYTES,
  isImageType,
  uploadImageBytes,
  uuidv7,
  waitForAsset,
  type ImageType,
} from '@repo/core';
import { AppText } from '@/components/app-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { useTokenColors } from '@/theme';
import { useMsg, useT } from '@/lib/i18n';
import { AssetImage, useCatalogueErrorText } from './parts';
import { useProduct, useSetGallery } from './queries';

type Phase = 'uploading' | 'uploadError' | 'processing' | 'slow' | 'failed' | 'attaching' | 'attachError';
interface Pending {
  id: string;
  body: Blob;
  type: ImageType;
  phase: Phase;
  error?: string;
}

/** Some platforms leave mimeType out of the picker result; fall back to the file extension. */
function mimeOf(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.mimeType) return asset.mimeType;
  const ext = asset.uri.split('?')[0]!.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Product gallery on mobile — mirrors web's GalleryCard: client UUIDv7 asset id → upload bytes →
 * poll until READY → replace the gallery with the current product revision. Retries reuse the
 * same id and bytes.
 */
export function ProductImageSection({ productId, name }: { productId: string; name: string }) {
  const c = useTokenColors();
  const t = useT('productEditor.image');
  const tm = useMsg();
  const errorText = useCatalogueErrorText();
  const qc = useQueryClient();
  const product = useProduct(productId).data;
  const gallery = useSetGallery(productId);
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<string>();
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  if (!product) return null;
  const ids = product.galleryAssetIds;
  const update = (patch: Partial<Pending>) => alive.current && setPending((p) => (p ? { ...p, ...patch } : p));

  const save = async (assetIds: string[]) => {
    const latest = await qc.fetchQuery({ ...catalogueQueries.product(productId), staleTime: 0 });
    return gallery.mutateAsync({ expectedRevision: latest.revision, assetIds });
  };
  const attach = async (p: Pending) => {
    update({ phase: 'attaching', error: undefined });
    try {
      const latest = await qc.fetchQuery({ ...catalogueQueries.product(productId), staleTime: 0 });
      if (!latest.galleryAssetIds.includes(p.id)) await gallery.mutateAsync({ expectedRevision: latest.revision, assetIds: [...latest.galleryAssetIds, p.id] });
      if (alive.current) setPending(null);
    } catch (e) {
      update({ phase: 'attachError', error: errorText(e) });
    }
  };
  const poll = async (p: Pending) => {
    update({ phase: 'processing', error: undefined });
    try {
      const asset = await waitForAsset(p.id, { timeoutMs: 60_000 });
      if (asset.state === 'READY') return attach(p);
      if (asset.state === 'FAILED' || asset.state === 'DELETED') return update({ phase: 'failed', error: tm(assetFailureMsg(asset.failureCode)) });
      update({ phase: 'slow' });
    } catch (e) {
      update({ phase: 'slow', error: errorText(e) });
    }
  };
  const upload = async (p: Pending) => {
    update({ phase: 'uploading', error: undefined });
    try {
      await uploadImageBytes(p.id, p.body, p.type);
    } catch (e) {
      return update({ phase: 'uploadError', error: errorText(e) });
    }
    return poll(p);
  };

  const pick = async () => {
    setProblem(undefined);
    if (ids.length >= GALLERY_MAX) return setProblem(t('full', { count: GALLERY_MAX }));
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const type = mimeOf(asset);
    if (!isImageType(type)) return setProblem(t('wrongType'));
    const body = await (await fetch(asset.uri)).blob();
    if (body.size > IMAGE_MAX_BYTES) return setProblem(t('tooLarge', { mb: 5 }));
    const next: Pending = { id: uuidv7(), body, type, phase: 'uploading' };
    setPending(next);
    void upload(next);
  };

  const busy = gallery.isPending || (!!pending && pending.phase !== 'failed');

  return (
    <Card>
      <CardHeader title={t('title')} description={t('description', { count: GALLERY_MAX, mb: 5 })} />
      {ids.length === 0 ? (
        <AssetImage assetId={undefined} className="w-full rounded-lg" style={{ aspectRatio: 4 / 3 }} />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {ids.map((id, i) => (
            <View key={id} className="w-[48%] gap-1">
              <AssetImage assetId={id} className="w-full rounded-lg" style={{ aspectRatio: 4 / 3 }} accessibilityLabel={t('alt', { n: i + 1, name })} />
              <View className="flex-row items-center gap-3">
                {i === 0 ? (
                  <Badge variant="info">{t('main')}</Badge>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('makeMain')}
                    hitSlop={8}
                    disabled={busy}
                    onPress={() => void save([id, ...ids.filter((x) => x !== id)]).catch((e) => Alert.alert(errorText(e)))}>
                    <Star size={18} color={c['muted-foreground']} />
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('remove')}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => void save(ids.filter((x) => x !== id)).catch((e) => Alert.alert(errorText(e)))}>
                  <Trash2 size={18} color={c['muted-foreground']} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
      {pending && (
        <View className="gap-2 rounded-lg border border-border p-3">
          <AppText className="text-sm text-muted-foreground">
            {pending.phase === 'uploading' ? t('uploading') : pending.phase === 'slow' ? t('processingSlow') : pending.phase === 'processing' || pending.phase === 'attaching' ? t('processing') : ''}
          </AppText>
          <FieldError>{pending.error}</FieldError>
          <View className="flex-row flex-wrap gap-2">
            {pending.phase === 'uploadError' && (
              <Button size="sm" variant="outline" onPress={() => void upload(pending)}>
                {t('retryUpload')}
              </Button>
            )}
            {(pending.phase === 'slow' || pending.phase === 'attachError') && (
              <Button size="sm" variant="outline" onPress={() => void (pending.phase === 'slow' ? poll(pending) : attach(pending))}>
                {t('checkAgain')}
              </Button>
            )}
            {['uploadError', 'slow', 'failed', 'attachError'].includes(pending.phase) && (
              <Button size="sm" variant="ghost" onPress={() => setPending(null)}>
                {t('discard')}
              </Button>
            )}
          </View>
        </View>
      )}
      <Button variant="outline" loading={!!pending && ['uploading', 'processing', 'attaching'].includes(pending.phase)} disabled={busy || ids.length >= GALLERY_MAX} onPress={() => void pick()}>
        {t('add')}
      </Button>
      <FieldError>{problem}</FieldError>
    </Card>
  );
}
