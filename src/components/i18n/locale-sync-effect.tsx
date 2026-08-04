"use client";

import { useEffect } from "react";
import { useEazo } from "@eazo/sdk/react";
import { getLocalePreference, normalizeLocale } from "@/i18n";
import i18n from "@/i18n";

/**
 * When preference is "system", align app locale with @eazo/sdk device.locale.
 */
export function LocaleSyncEffect() {
  const deviceLocale = useEazo((s) => s.device.locale);

  useEffect(() => {
    if (getLocalePreference() !== "system") return;

    const sdkLocale = normalizeLocale(deviceLocale);
    if (!sdkLocale) return;

    const active = normalizeLocale(i18n.resolvedLanguage || i18n.language);
    if (active !== sdkLocale) {
      void i18n.changeLanguage(sdkLocale);
    }
  }, [deviceLocale]);

  return null;
}
