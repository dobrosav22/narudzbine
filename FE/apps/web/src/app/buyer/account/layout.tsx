import { AccountFrame } from "@/features/org-admin/parts";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountFrame base="/buyer/account">{children}</AccountFrame>;
}
