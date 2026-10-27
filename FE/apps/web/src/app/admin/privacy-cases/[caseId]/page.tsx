"use client";

import { use } from "react";
import { AdminPrivacyCaseScreen } from "@/features/admin/privacy-case-screen";

export default function AdminPrivacyCasePage({ params }: PageProps<"/admin/privacy-cases/[caseId]">) {
  const { caseId } = use(params);
  return <AdminPrivacyCaseScreen key={caseId} caseId={caseId} />;
}
