import { AuthShell } from "@/features/auth/auth-shell";
import { FullPageSpinner } from "@/features/shell/guards";
import { SessionSettled } from "@/features/auth/session-settled";

/** Emailed-link pages (reset, invitation, setup, email proof, recovery): reachable signed in or out. */
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthShell>
      <SessionSettled fallback={<FullPageSpinner />}>{children}</SessionSettled>
    </AuthShell>
  );
}
