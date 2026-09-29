import { Suspense } from "react";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { FullPageSpinner, RedirectIfSignedIn } from "@/features/shell/guards";

export default function LoginPage() {
  return (
    <RedirectIfSignedIn>
      <AuthShell>
        {/* useSearchParams (?next=) needs a Suspense boundary on a static route. */}
        <Suspense fallback={<FullPageSpinner />}>
          <LoginForm />
        </Suspense>
      </AuthShell>
    </RedirectIfSignedIn>
  );
}
