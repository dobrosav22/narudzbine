import { AppShell } from "@/features/shell/app-shell";
import { RequireOrg } from "@/features/shell/guards";

export default function VendorLayout({ children }: LayoutProps<"/vendor">) {
  return (
    <RequireOrg type="VENDOR">
      <AppShell kind="vendor">{children}</AppShell>
    </RequireOrg>
  );
}
