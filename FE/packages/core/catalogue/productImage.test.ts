import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderEnglish as en } from '../i18n/message';
import { createServices } from '../serviceProvider';
import { db, resetMockDb } from '../mocks/db';
import { setMockLatency } from '../mocks/util';
import { isServiceError } from '../errors';
import { productImageProblem } from './productImage';
import { productToDraft, validateProductDraft } from './productForm';

setMockLatency(0);
const s = createServices(true);
beforeEach(() => resetMockDb());

test('seed: some products have a picture, some do not (both paths on screen)', () => {
  const withImage = db.products.filter((p) => p.imageUrl);
  assert.ok(withImage.length >= 10);
  assert.ok(db.products.some((p) => !p.imageUrl));
  assert.ok(withImage.every((p) => p.imageUrl!.startsWith('data:image/png;base64,')));
});

test('file check: JPG/PNG/WebP up to 5 MB', () => {
  assert.equal(productImageProblem({ mimeType: 'image/png', sizeBytes: 1000 }), undefined);
  assert.equal(en(productImageProblem({ mimeType: 'image/gif' })!), 'Use a JPG, PNG or WebP image');
  assert.match(en(productImageProblem({ mimeType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024 })!), /up to 5 MB/);
});

test('upload → save on the product → remove clears it', async () => {
  await assert.rejects(
    s.catalogue.uploadProductImage({ vendorOrgId: 'vo_papirko', uri: 'data:image/gif;base64,xx', mimeType: 'image/gif' }),
    (e) => isServiceError(e, 'VALIDATION'),
  );
  const { url } = await s.catalogue.uploadProductImage({ vendorOrgId: 'vo_papirko', uri: 'data:image/png;base64,AAA', mimeType: 'image/png', sizeBytes: 3 });
  const product = db.products.find((p) => p.id === 'p_glv_nitrile')!;
  const save = async (imageUrl: string) => {
    const result = validateProductDraft({ ...productToDraft(product), imageUrl }, { tracksInventory: true });
    assert.ok(result.ok);
    return s.catalogue.updateProduct(product.id, result.value);
  };
  assert.equal((await save(url)).imageUrl, url);
  assert.equal((await save('')).imageUrl, undefined);
});
