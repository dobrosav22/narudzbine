import { AppShell } from "@/features/shell/app-shell";
import { RequireAdmin } from "@/features/shell/guards";

/** v1.1 Platform Admin shell (02 "Admin panel"): web-only, role-gated under /admin. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireAdmin>
      <AppShell orgType="admin">{children}</AppShell>
    </RequireAdmin>
  );
}
