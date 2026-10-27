import { AuthShell } from "@/features/auth/auth-shell";
import { RedirectIfSignedIn } from "@/features/shell/guards";

/** Signed-out-only pages (login, forgot password): a signed-in user goes straight home. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <RedirectIfSignedIn>
      <AuthShell>{children}</AuthShell>
    </RedirectIfSignedIn>
  );
}
