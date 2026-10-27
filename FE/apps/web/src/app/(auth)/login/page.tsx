import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { FullPageSpinner } from "@/features/shell/guards";

export default function LoginPage() {
  return (
    // useSearchParams (?next=) needs a Suspense boundary on a static route.
    <Suspense fallback={<FullPageSpinner />}>
      <LoginForm />
    </Suspense>
  );
}
