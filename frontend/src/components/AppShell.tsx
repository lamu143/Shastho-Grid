"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import {
  Activity,
  Building2,
  BarChart3,
  Bot,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Navigation,
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
import { ThemeToggle } from "@/components/ThemeToggle";
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
  { href: "/radar", labelKey: "nav.radar", icon: Navigation, publicPreview: true },
  { href: "/copilot", labelKey: "nav.copilot", icon: Bot, roles: CRITICAL_CARE, publicPreview: true },
  { href: "/race-lab", labelKey: "nav.racelab", icon: Zap, roles: CRITICAL_CARE, publicPreview: true },
  { href: "/insights", labelKey: "nav.insights", icon: Activity, roles: ["dispatcher", "hospital_admin", "blood_bank_officer", "auditor", "admin"] },
  { href: "/facility", labelKey: "nav.facility", icon: Building2, roles: ["hospital_admin", "blood_bank_officer", "admin"] },
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
  // Deepen the glass header's shadow once content scrolls under it (macOS toolbar behaviour).
  const [scrolled, setScrolled] = useState(false);
  const [headerCompact, setHeaderCompact] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let lastY = window.scrollY;
    let direction = 0;
    let distance = 0;
    let reverseDirection = 0;
    let reverseDistance = 0;
    let compact = false;
    const onScroll = () => {
      const y = Math.max(0, window.scrollY);
      setScrolled((wasScrolled) => (wasScrolled === (y > 4) ? wasScrolled : y > 4));
      if (y < 96) {
        direction = 0;
        distance = 0;
        reverseDirection = 0;
        reverseDistance = 0;
        if (compact) {
          compact = false;
          setHeaderCompact(false);
        }
      } else if (headerRef.current?.querySelector(":focus-visible")) {
        direction = 0;
        distance = 0;
        reverseDirection = 0;
        reverseDistance = 0;
        if (compact) {
          compact = false;
          setHeaderCompact(false);
        }
      } else {
        const delta = y - lastY;
        if (delta !== 0) {
          const nextDirection = delta > 0 ? 1 : -1;
          const amount = Math.abs(delta);
          if (direction === 0) {
            direction = nextDirection;
            distance = amount;
          } else if (nextDirection === direction) {
            // Accumulate even small trackpad deltas, but require a deliberate
            // reverse scroll before changing the header's state.
            distance += amount;
            reverseDirection = 0;
            reverseDistance = 0;
          } else {
            if (reverseDirection !== nextDirection) {
              reverseDirection = nextDirection;
              reverseDistance = 0;
            }
            reverseDistance += amount;
            if (reverseDistance >= 24) {
              direction = nextDirection;
              distance = reverseDistance;
              reverseDirection = 0;
              reverseDistance = 0;
            }
          }
          if (!compact && direction > 0 && y > 180 && distance >= 36) {
            compact = true;
            distance = 0;
            setHeaderCompact(true);
          }
          if (compact && direction < 0 && distance >= 24) {
            compact = false;
            distance = 0;
            setHeaderCompact(false);
          }
        }
      }
      lastY = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const router = useRouter();
  const { t, locale } = useI18n();
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [featureListOpen, setFeatureListOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // Keep the current destination visible in the horizontally browsable feature rail.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const activeLink = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!activeLink) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      activeLink.scrollIntoView({
        behavior: reduceMotion ? "instant" : "smooth",
        block: "nearest",
        inline: "center",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen && !featureListOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        setFeatureListOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen, featureListOpen]);
  const touchStart = useRef<{ x: number; y: number; target: Element | null } | null>(null);
  const [swipeDirection, setSwipeDirection] = useState<"next" | "previous" | null>(null);

  const visibleNavItems = useMemo(() => NAV_ITEMS.filter((item) => canSee(item, user?.role)), [user?.role]);
  const primaryNavItems = useMemo(() => visibleNavItems.filter((item) => !item.secondary), [visibleNavItems]);
  const secondaryNavItems = useMemo(() => visibleNavItems.filter((item) => item.secondary), [visibleNavItems]);
  const warmRoute = useCallback((href: string) => router.prefetch(href), [router]);

  // Warm every permitted feature as soon as the shell is hydrated. Next's route
  // cache then makes the first click feel immediate instead of waiting for hover.
  useEffect(() => {
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;
    const routes = primaryNavItems.map((i) => i.href);
    for (const href of routes) {
      warmRoute(href);
    }
  }, [primaryNavItems, warmRoute]);

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
    <div className="flex min-h-screen flex-col text-ink">
      <OfflineHydrator />
      <FloatingAssistant />
      <div className="sg-scroll-colorwash" data-active={scrolled} aria-hidden="true" />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {t("nav.skipToContent")}
      </a>

      <header ref={headerRef} className="glass-bar sticky top-0 z-30" data-scrolled={scrolled} data-compact={headerCompact}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="order-1 flex shrink-0 items-center gap-2.5">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-2 rounded-xl transition-[filter] duration-200 hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <LogoMark className="h-9 w-9 shrink-0" animated />
              <span className="shrink-0 whitespace-nowrap text-base font-extrabold tracking-tight text-ink sm:text-lg">
                Shastho<span className="text-brand-ink">Grid</span>
              </span>
            </Link>
          </div>

          <div className="order-3 hidden w-full min-w-0 items-center gap-2 border-t border-line/60 pt-2 xl:flex">
            <button
              type="button"
              aria-label={t("nav.scrollPrevious")}
              onClick={() => navRef.current?.scrollBy({ left: -280, behavior: "smooth" })}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 bg-surface/55 text-ink-2 transition hover:bg-surface hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
            <nav
              ref={navRef}
              aria-label={t("nav.primaryLabel")}
              tabIndex={0}
              onWheel={(event) => {
                const element = event.currentTarget;
                if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && element.scrollWidth > element.clientWidth) {
                  element.scrollBy({ left: event.deltaY, behavior: "smooth" });
                  event.preventDefault();
                }
              }}
              className="nav-scroll segmented min-h-11 min-w-0 flex-1 items-center rounded-2xl border border-white/50 bg-white/35 px-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035]"
            >
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onMouseEnter={() => warmRoute(item.href)}
                    onFocus={() => warmRoute(item.href)}
                    className={`group inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 active:scale-[0.98] motion-reduce:transition-none ${
                      isActive
                        ? "bg-surface text-brand-ink shadow-[0_2px_8px_rgb(10_30_40/0.12),inset_0_1px_0_rgb(255_255_255/0.9)] ring-1 ring-black/[0.035]"
                        : "text-ink-2 hover:-translate-y-0.5 hover:bg-brand-soft hover:text-brand-ink hover:shadow-[0_5px_16px_rgb(15_118_110/0.15),inset_0_1px_0_rgb(255_255_255/0.7)] hover:ring-1 hover:ring-brand/20"
                    }`}
                  >
                    <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 transition-colors duration-200 ${isActive ? "text-brand-ink" : "text-ink-3 group-hover:text-brand-ink"}`} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              aria-label={t("nav.scrollNext")}
              onClick={() => navRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 bg-surface/55 text-ink-2 transition hover:bg-surface hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                aria-expanded={featureListOpen}
                aria-haspopup="true"
                onClick={() => setFeatureListOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/70 bg-surface/75 px-3 py-2 text-sm font-semibold text-ink shadow-[0_2px_10px_rgb(10_30_40/0.08),inset_0_1px_0_rgb(255_255_255/0.9)] backdrop-blur-xl transition hover:border-brand/30 hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-brand dark:border-white/10 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1)]"
              >
                <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{t("nav.allFeatures")}</span>
                <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.7rem] text-brand-ink">{primaryNavItems.length}</span>
              </button>
              {featureListOpen && (
                <>
                  <button className="fixed inset-0 z-30 cursor-default" aria-label={t("nav.closeFeatures")} onClick={() => setFeatureListOpen(false)} />
                  <nav aria-label={t("nav.allFeatures")} className="absolute right-0 top-full z-40 mt-2 max-h-[min(70vh,32rem)] w-72 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-[0_18px_55px_rgb(10_30_40/0.2)]">
                    <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{t("nav.availableFeatures")}</p>
                    {primaryNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(`${item.href}/`));
                      return (
                        <Link key={item.href} href={item.href} prefetch aria-current={isActive ? "page" : undefined} onMouseEnter={() => warmRoute(item.href)} onFocus={() => warmRoute(item.href)} onClick={() => setFeatureListOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? "bg-brand-soft text-brand-ink" : "text-ink-2 hover:bg-fill hover:text-ink"}`}>
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-fill text-brand-ink"><Icon aria-hidden="true" className="h-4 w-4" /></span>
                          <span className="font-semibold">{t(item.labelKey)}</span>
                          <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 opacity-50" />
                        </Link>
                      );
                    })}
                  </nav>
                </>
              )}
            </div>
          </div>

          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
            <div className="hidden sm:block">
              <OfflineIndicator />
            </div>
            {/* Phones: the theme picker lives in the menu so the header stays one row. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            <LanguageToggle />
            {secondaryNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  className={`hidden h-8 w-8 items-center justify-center rounded-full border border-line transition xl:inline-flex ${
                    pathname === item.href ? "bg-surface text-brand-ink shadow-sm" : "bg-surface/60 text-ink-2 hover:bg-surface"
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
                className="hidden items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-surface sm:inline-flex"
              >
                <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
                <span>{t("nav.logout")}</span>
              </button>
            ) : (
              <Link
                href="/login"
                className="hidden items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-strong sm:inline-flex"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface/70 text-ink-2 transition hover:bg-surface xl:hidden"
            >
              {mobileMenuOpen ? (
                <X aria-hidden="true" className="h-5 w-5" />
              ) : (
                <Menu aria-hidden="true" className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        <div className="border-t border-line px-4 py-1.5 sm:hidden">
          <OfflineIndicator />
        </div>

        {mobileMenuOpen && (
          <nav
            id="mobile-navigation-drawer"
            aria-label={t("nav.mobileLabel")}
            className="border-t border-line px-4 py-3 xl:hidden"
          >
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-fill px-3 py-2 sm:hidden">
              <span className="text-sm font-semibold text-ink-2">{locale === "bn" ? "রঙের থিম" : "Colour theme"}</span>
              <ThemeToggle />
            </div>
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
                    aria-current={isActive ? "page" : undefined}
                    onMouseEnter={() => warmRoute(item.href)}
                    onFocus={() => warmRoute(item.href)}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 active:scale-[0.99] ${
                      isActive
                        ? "bg-brand text-white"
                        : "text-ink-2 hover:bg-fill"
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
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm font-semibold text-ink-2 hover:bg-fill"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{t("nav.logout")}</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
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
        <div
          key={swipeDirection ? pathname : "main"}
          className={`sg-page-transition ${swipeDirection ? `sg-page-transition-${swipeDirection}` : ""}`}
        >
          {children}
        </div>
      </main>

      <footer className="glass-bar border-t border-line px-4 py-4 pr-24 text-xs text-ink-3 sm:px-6 sm:pr-28 lg:px-8 lg:pr-28">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <p className="font-medium text-ink-2">
            {t("app.name")} — {t("app.tagline")}
          </p>
          {user && (
            <p className="text-ink-2">
              {user.clinic_name} · {user.role.toUpperCase()}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
