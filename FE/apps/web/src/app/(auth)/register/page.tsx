import { AuthShell } from "@/features/auth/auth-shell";
import { RegisterForm } from "@/features/auth/register-form";
import { RedirectIfSignedIn } from "@/features/shell/guards";

export default function RegisterPage() {
  return (
    <RedirectIfSignedIn>
      <AuthShell>
        <RegisterForm />
      </AuthShell>
    </RedirectIfSignedIn>
  );
}
