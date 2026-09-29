import { AuthShell } from "@/features/auth/auth-shell";
import { InviteAccept } from "@/features/auth/invite-accept";

// Not behind RedirectIfSignedIn: a signed-in user may accept an invite for
// another org (e.g. an existing buyer invited by a second vendor).
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return (
    <AuthShell>
      <InviteAccept token={token} />
    </AuthShell>
  );
}
