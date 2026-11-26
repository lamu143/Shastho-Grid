"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { bootstrapClinicState } from "@/lib/syncEngine";

export function OfflineHydrator() {
  const { user, token, isOfflineSession } = useAuth();
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user || !token || isOfflineSession) return;
    if (!window.navigator.onLine) return;

    const sessionKey = `${user.id}:${user.clinic_id}`;
    if (hydratedKeyRef.current === sessionKey) return;

    let cancelled = false;
    const run = async () => {
      try {
        await bootstrapClinicState({ clinicId: user.clinic_id });
        if (!cancelled) {
          hydratedKeyRef.current = sessionKey;
        }
      } catch {
        // Non-blocking: ignore offline or transient errors without console noise
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [user, token, isOfflineSession]);

  return null;
}
