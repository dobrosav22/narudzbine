import { AppShell } from "@/features/shell/app-shell";
import { RequireOrg } from "@/features/shell/guards";

export default function BuyerLayout({ children }: LayoutProps<"/buyer">) {
  return (
    <RequireOrg type="BUYER">
      <AppShell kind="buyer">{children}</AppShell>
    </RequireOrg>
  );
}
