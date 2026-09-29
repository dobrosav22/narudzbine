import { AppShell } from "@/features/shell/app-shell";
import { RequireRole } from "@/features/shell/guards";

export default function BuyerLayout({ children }: LayoutProps<"/buyer">) {
  return (
    <RequireRole orgType="buyer">
      <AppShell orgType="buyer">{children}</AppShell>
    </RequireRole>
  );
}
