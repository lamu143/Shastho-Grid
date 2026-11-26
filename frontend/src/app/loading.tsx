import { LogoMark } from "@/components/brand/Logo";

/** Immediate visual feedback while a route chunk or server segment is prepared. */
export default function Loading() {
  return (
    <div className="flex min-h-[52vh] items-center justify-center px-4" role="status" aria-live="polite">
      <div className="mac-card flex items-center gap-4 rounded-2xl px-5 py-4 text-ink shadow-xl">
        <LogoMark className="h-11 w-11 shrink-0" animated />
        <div>
          <p className="font-semibold">Opening feature</p>
          <p className="text-sm text-ink-3">ফিচারটি খোলা হচ্ছে</p>
        </div>
        <span aria-hidden="true" className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand motion-reduce:animate-none" />
        <span className="sr-only">Loading</span>
      </div>
    </div>
  );
}
