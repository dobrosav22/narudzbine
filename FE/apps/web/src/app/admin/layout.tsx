import { AppShell } from "@/features/shell/app-shell";
import { RequireAdmin } from "@/features/shell/guards";

/** Platform-admin shell: web-only, for PLATFORM_ADMIN accounts (no business membership). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RequireAdmin>
      <AppShell kind="admin">{children}</AppShell>
    </RequireAdmin>
  );
}
