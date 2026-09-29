import type { FavoritesService } from '../buyer';
import { notImplemented } from '../../errors';

// Real implementation pending the backend — see 04-data-contract-api-outline.md.
// Replace each stub with a real call when its endpoint exists.
export const favoritesService: FavoritesService = {
  list: async () => notImplemented('favorites.list'),
  toggle: async () => notImplemented('favorites.toggle'),
};
