import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { BASE_URL } from "./api";
import { getSyncNowButton } from "./locators";

export interface DexieStoreSnapshot {
  databaseExists: boolean;
  storeNames: string[];
  patients: Record<string, unknown>[];
  batches: Record<string, unknown>[];
  guidelines: Record<string, unknown>[];
  syncMutations: Record<string, unknown>[];
  conflicts: Record<string, unknown>[];
}

export async function withPersistentContext<T>(
  fn: (context: BrowserContext, page: Page) => Promise<T>,
  options?: {
    baseURL?: string;
    viewport?: { width: number; height: number };
    reducedMotion?: "reduce" | "no-preference";
  }
): Promise<T> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awaregrid-pw-"));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      baseURL: options?.baseURL ?? BASE_URL,
      viewport: options?.viewport ?? { width: 1440, height: 900 },
      serviceWorkers: "allow",
      reducedMotion: options?.reducedMotion,
    });
    const existingPages = context.pages();
    const page = existingPages[0] ?? (await context.newPage());
    return await fn(context, page);
  } finally {
    if (context) {
      await context.close();
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

export async function waitForSerwistController(
  page: Page,
  timeoutMs = 20_000
): Promise<boolean> {
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) {
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active) && navigator.serviceWorker.controller !== null;
    },
    null,
    { timeout: timeoutMs }
  );

  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active) && navigator.serviceWorker.controller !== null;
  });
}

export async function warmCachedRoutes(
  page: Page,
  routes: string[]
): Promise<void> {
  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  }
}

export async function inspectDexieStores(
  page: Page
): Promise<DexieStoreSnapshot> {
  return page.evaluate(async () => {
    const emptySnapshot: DexieStoreSnapshot = {
      databaseExists: false,
      storeNames: [],
      patients: [],
      batches: [],
      guidelines: [],
      syncMutations: [],
      conflicts: [],
    };

    if (!("indexedDB" in window)) {
      return emptySnapshot;
    }

    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      const found = dbs.some((db) => db.name === "awaregrid_offline_v1");
      if (!found) {
        return emptySnapshot;
      }
    }

    return await new Promise<DexieStoreSnapshot>((resolve, reject) => {
      const request = indexedDB.open("awaregrid_offline_v1");
      request.onerror = () => {
        reject(request.error ?? new Error("Failed to open awaregrid_offline_v1"));
      };
      request.onsuccess = () => {
        const db = request.result;
        const storeNames = Array.from(db.objectStoreNames);
        const targetStores = [
          "patients",
          "batches",
          "guidelines",
          "syncMutations",
          "conflicts",
        ].filter((name) => storeNames.includes(name));

        if (targetStores.length === 0) {
          db.close();
          resolve({
            ...emptySnapshot,
            databaseExists: true,
            storeNames,
          });
          return;
        }

        const tx = db.transaction(targetStores, "readonly");
        const result: DexieStoreSnapshot = {
          databaseExists: true,
          storeNames,
          patients: [],
          batches: [],
          guidelines: [],
          syncMutations: [],
          conflicts: [],
        };

        for (const storeName of targetStores) {
          const store = tx.objectStore(storeName);
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const rows = (getAllReq.result ?? []) as Record<string, unknown>[];
            if (storeName === "patients") result.patients = rows;
            if (storeName === "batches") result.batches = rows;
            if (storeName === "guidelines") result.guidelines = rows;
            if (storeName === "syncMutations") result.syncMutations = rows;
            if (storeName === "conflicts") result.conflicts = rows;
          };
        }

        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
        };
      };
    });
  });
}

export async function reconnectAndSyncMutations(
  context: BrowserContext,
  page: Page,
  options?: {
    beforeSyncClick?: () => Promise<void>;
    timeoutMs?: number;
  }
): Promise<Response> {
  let capturedResponse: Response | null = null;
  const responsePromise = page
    .waitForResponse(
      (res) =>
        res.url().includes("/api/v1/sync/mutations") &&
        res.request().method() === "POST",
      { timeout: options?.timeoutMs ?? 25_000 }
    )
    .then((res) => {
      capturedResponse = res;
      return res;
    })
    .catch(() => null);

  await context.setOffline(false);
  await page.goto("/dashboard/sync", { waitUntil: "domcontentloaded" });

  if (options?.beforeSyncClick) {
    await options.beforeSyncClick();
  }

  const syncBtn = getSyncNowButton(page);
  await expect
    .poll(
      async () => {
        if (capturedResponse) {
          return "synced";
        }
        const vis = await syncBtn.isVisible().catch(() => false);
        const en = vis ? await syncBtn.isEnabled().catch(() => false) : false;
        return vis && en ? "ready" : "waiting";
      },
      { timeout: Math.min(15_000, options?.timeoutMs ?? 15_000) }
    )
    .not.toBe("waiting");

  if (
    !capturedResponse &&
    (await syncBtn.isVisible().catch(() => false)) &&
    (await syncBtn.isEnabled().catch(() => false))
  ) {
    try {
      await syncBtn.click({ timeout: 10_000 });
    } catch (err) {
      if (!capturedResponse) {
        throw err;
      }
    }
  }

  const resolved = capturedResponse ?? (await responsePromise);
  expect(
    resolved,
    "Expected POST /api/v1/sync/mutations response after reconnect"
  ).not.toBeNull();
  return resolved!;
}
