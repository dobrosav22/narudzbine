import type en from "../../../packages/core/i18n/en.json";

// Typed keys: t("typo.key") fails the build (next-intl AppConfig augmentation).
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
  }
}
