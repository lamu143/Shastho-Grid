"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Settings,
  Shield,
  Siren,
  Stethoscope,
  User,
  X,
  Zap,
} from "lucide-react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { useAuth } from "@/lib/authContext";
import type { UserRole } from "@/db/dexie";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { LanguageToggle } from "@/components/LanguageToggle";
import { OfflineHydrator } from "@/components/OfflineHydrator";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { FloatingAssistant } from "@/components/FloatingAssistant";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  /** Roles that see this item. Omit for every signed-in role. */
  roles?: UserRole[];
  /** Shown to signed-out visitors (marketing preview). */
  publicPreview?: boolean;
  /** Profile/settings: icon buttons in the toolbar, full rows in the mobile drawer. */
  secondary?: boolean;
}

const STEWARDSHIP: UserRole[] = ["dispenser", "pharmacist", "auditor", "admin"];
const CRITICAL_CARE: UserRole[] = ["dispatcher", "admin"];

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: STEWARDSHIP, publicPreview: true },
  { href: "/dashboard/triage", labelKey: "nav.triage", icon: Stethoscope, roles: STEWARDSHIP, publicPreview: true },
  { href: "/dashboard/inventory", labelKey: "nav.inventory", icon: Package, roles: STEWARDSHIP },
  { href: "/dashboard/sync", labelKey: "nav.sync", icon: RefreshCw, roles: STEWARDSHIP },
  { href: "/dashboard/analytics", labelKey: "nav.analytics", icon: BarChart3, roles: STEWARDSHIP, publicPreview: true },
  { href: "/dispatch", labelKey: "nav.dispatch", icon: Siren, roles: CRITICAL_CARE, publicPreview: true },
  { href: "/copilot", labelKey: "nav.copilot", icon: Bot, roles: CRITICAL_CARE, publicPreview: true },
  { href: "/race-lab", labelKey: "nav.racelab", icon: Zap, roles: CRITICAL_CARE, publicPreview: true },
  { href: "/admin", labelKey: "nav.admin", icon: Shield, roles: ["admin"] },
  { href: "/dashboard/profile", labelKey: "nav.profile", icon: User, secondary: true },
  { href: "/dashboard/settings", labelKey: "nav.settings", icon: Settings, secondary: true },
];

function canSee(item: NavItem, role: UserRole | undefined): boolean {
  if (!role) return Boolean(item.publicPreview);
  return !item.roles || item.roles.includes(role);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"next" | "previous" | null>(null);

  const visibleNavItems = NAV_ITEMS.filter((item) => canSee(item, user?.role));
  const primaryNavItems = visibleNavItems.filter((item) => !item.secondary);
  const secondaryNavItems = visibleNavItems.filter((item) => item.secondary);

  const handleSignOut = () => {
    signOut();
    setMobileMenuOpen(false);
    router.push("/login");
  };

  const handleContentTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      target: event.target instanceof Element ? event.target : null,
    };
  };

  const handleContentTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || !start.target || event.changedTouches.length !== 1) return;
    if (start.x < 24 || start.x > window.innerWidth - 24) return;
    if (start.target.closest("a, button, input, textarea, select, [role=slider], [data-swipe-lock]")) return;

    for (let element: Element | null = start.target; element && element !== event.currentTarget; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      if (element.scrollWidth > element.clientWidth + 2 && /(auto|scroll)/.test(style.overflowX)) return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;

    const currentIndex = primaryNavItems.findIndex((item) =>
      pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(`${item.href}/`)),
    );
    if (currentIndex < 0) return;

    const direction = deltaX < 0 ? "next" : "previous";
    const destination = currentIndex + (direction === "next" ? 1 : -1);
    if (destination < 0 || destination >= primaryNavItems.length) return;
    setSwipeDirection(direction);
    router.push(primaryNavItems[destination].href);
    window.setTimeout(() => setSwipeDirection(null), 350);
  };

  return (
    <div className="flex min-h-screen flex-col text-[#172A33]">
      <OfflineHydrator />
      <FloatingAssistant />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-[#0F766E] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {t("nav.skipToContent")}
      </a>

      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2.5">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F766E]"
            >
              <LogoMark className="h-9 w-9 shrink-0" animated />
              <span className="shrink-0 whitespace-nowrap text-base font-extrabold tracking-tight text-[#172A33] sm:text-lg">
                Shastho<span className="text-[#0F766E]">Grid</span>
              </span>
            </Link>
          </div>

          <nav
            aria-label={t("nav.primaryLabel")}
            tabIndex={0}
            onWheel={(event) => {
              const element = event.currentTarget;
              if (
                Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
                element.scrollWidth > element.clientWidth
              ) {
                element.scrollLeft += event.deltaY;
                event.preventDefault();
              }
            }}
            className="nav-scroll segmented hidden min-w-0 flex-1 items-center xl:inline-flex"
          >
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname?.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[0.6rem] px-2.5 py-1.5 text-[0.8125rem] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white text-[#0F766E] shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]"
                      : "text-[#405663] hover:bg-white/60 hover:text-[#172A33]"
                  }`}
                >
                  <Icon aria-hidden="true" className="hidden h-3.5 w-3.5 shrink-0 2xl:block" />
                  <span>{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <OfflineIndicator />
            </div>
            <LanguageToggle />
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  className={`hidden h-8 w-8 items-center justify-center rounded-full border border-black/10 transition xl:inline-flex ${
                    pathname === item.href ? "bg-white text-[#0F766E] shadow-sm" : "bg-white/60 text-[#405663] hover:bg-white"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </Link>
              );
            })}

            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="hidden items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-[#405663] transition hover:bg-white sm:inline-flex"
              >
                <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{t("nav.logout")}</span>
              </button>
            ) : (
              <Link
                href="/login"
                className="hidden items-center gap-1.5 rounded-full bg-[#0F766E] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#115E59] sm:inline-flex"
              >
                <LogIn aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{t("nav.login")}</span>
              </Link>
            )}

            <button
              type="button"
              aria-label={t("nav.menu")}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-drawer"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white/70 text-[#405663] transition hover:bg-white xl:hidden"
            >
              {mobileMenuOpen ? (
                <X aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Menu aria-hidden="true" className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="border-t border-black/5 px-4 py-1.5 sm:hidden">
          <OfflineIndicator />
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-navigation-drawer"
            aria-label={t("nav.mobileLabel")}
            className="border-t border-black/5 px-4 py-3 xl:hidden"
          >
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname?.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                      isActive
                        ? "bg-[#0F766E] text-white"
                        : "text-[#405663] hover:bg-[#EDF3F5]"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}

              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 rounded-lg border border-[#DCE6E9] px-3 py-2 text-left text-sm font-semibold text-[#405663] hover:bg-[#EDF3F5]"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{t("nav.logout")}</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg bg-[#0F766E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#115E59]"
                >
                  <LogIn aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{t("nav.login")}</span>
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>

      <DisclaimerBanner />

      <main
        id="main-content"
        tabIndex={-1}
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
        className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8"
      >
        <div key={pathname} className={`sg-page-transition ${swipeDirection ? `sg-page-transition-${swipeDirection}` : ""}`}>
          {children}
        </div>
      </main>

      <footer className="glass-bar border-t border-black/5 px-4 py-4 text-xs text-[#5C727E] sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <p className="font-medium text-[#405663]">
            {t("app.name")} — {t("app.tagline")}
          </p>
          {user && (
            <p className="text-[#536975]">
              {user.clinic_name} · {user.role.toUpperCase()}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
