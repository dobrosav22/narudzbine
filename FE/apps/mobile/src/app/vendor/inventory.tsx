import { Stack } from 'expo-router';
import { InventoryScreen } from '@/features/vendor-catalogue/inventory-screen';
import { useT } from '@/lib/i18n';

export default function VendorInventory() {
  const t = useT('invInventory');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <InventoryScreen />
    </>
  );
}
