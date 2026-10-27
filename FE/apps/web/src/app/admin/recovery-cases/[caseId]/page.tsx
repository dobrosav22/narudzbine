"use client";

import { use } from "react";
import { AdminRecoveryCaseScreen } from "@/features/admin/recovery";

export default function AdminRecoveryCasePage({ params }: PageProps<"/admin/recovery-cases/[caseId]">) {
  const { caseId } = use(params);
  return <AdminRecoveryCaseScreen key={caseId} caseId={caseId} />;
}
