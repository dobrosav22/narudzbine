import type { Messages } from "@repo/core";

// Typed keys: t("typo.key") fails the build (next-intl AppConfig augmentation).
declare module "next-intl" {
  interface AppConfig {
    Messages: Messages;
  }
}
