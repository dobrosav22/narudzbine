import { formatNumber } from '../helpers';
import { msg, type Msg } from '../i18n/message';

/** [assumed] Formats every browser and phone can show; limits are ours until the backend sets its own. */
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PRODUCT_IMAGE_MB = 5;

/** Why a picked file can't be a product image, or undefined if it can. Same check in the mock service. */
export function productImageProblem(file: { mimeType: string; sizeBytes?: number }): Msg | undefined {
  if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) return msg('errors.imageType');
  if (file.sizeBytes !== undefined && file.sizeBytes > MAX_PRODUCT_IMAGE_MB * 1024 * 1024)
    return msg('errors.imageSize', { mb: formatNumber(MAX_PRODUCT_IMAGE_MB) });
  return undefined;
}
