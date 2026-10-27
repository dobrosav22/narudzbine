import { SettingsFrame } from "@/features/org-admin/parts";

/** Settings header and section links for every settings page (including plan and order stages). */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
