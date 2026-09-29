import type { PreferencesService } from '../services';
import { db } from './db';
import { delay, findOrThrow } from './util';

export const preferencesService: PreferencesService = {
  async updateLocale({ userId, userType, locale }) {
    await delay(120);
    const users = userType === 'vendor' ? db.vendorUsers : userType === 'buyer' ? db.buyerUsers : db.platformAdmins;
    findOrThrow<{ id: string; preferredLocale: typeof locale }>(users, (u) => u.id === userId, 'User').preferredLocale = locale;
  },
};
