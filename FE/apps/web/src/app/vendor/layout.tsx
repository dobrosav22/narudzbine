import { AppShell } from "@/features/shell/app-shell";
import { RequireRole } from "@/features/shell/guards";

export default function VendorLayout({ children }: LayoutProps<"/vendor">) {
  return (
    <RequireRole orgType="vendor">
      <AppShell orgType="vendor">{children}</AppShell>
    </RequireRole>
  );
}
