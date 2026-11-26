import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const API_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

const apiNetworkOnly = new NetworkOnly();

const runtimeCaching: RuntimeCaching[] = [
  ...API_METHODS.map((method) => ({
    matcher: ({ url: { pathname } }: { url: URL }) =>
      pathname.startsWith("/api/") || pathname === "/healthz",
    method,
    handler: apiNetworkOnly,
  })),
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) =>
          request.destination === "document" &&
          !new URL(request.url).pathname.startsWith("/api/"),
      },
    ],
  },
});

serwist.addEventListeners();
