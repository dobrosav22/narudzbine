"use client";

import { use } from "react";
import { AdminInvitationScreen } from "@/features/admin/invitation-screen";

export default function AdminInvitationPage({ params }: PageProps<"/admin/invitations/[invitationId]">) {
  const { invitationId } = use(params);
  return <AdminInvitationScreen key={invitationId} invitationId={invitationId} />;
}
