"use client";

import React, { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/authContext";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      if (cancelled || registrations.length === 0) return;
      await Promise.all(registrations.map((registration) => registration.unregister()));
      if ("caches" in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      }
      // Leave a production PWA's stale worker behind no longer; reload once so
      // the dev server's fresh chunks are fetched without that controller.
      const marker = "awaregrid_dev_sw_cleared";
      if (!sessionStorage.getItem(marker)) {
        sessionStorage.setItem(marker, "1");
        window.location.reload();
      }
    }).catch(() => {
      // Storage can be unavailable in private browsing; the app still loads online.
    });

    return () => { cancelled = true; };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <AuthProvider>{children}</AuthProvider>
      </I18nProvider>
    </MotionConfig>
  );
}
