import Link from "next/link";

export function PlateMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-[2px] border-2 border-ink bg-safety shadow-hard-sm ${className}`}
      aria-hidden="true"
    >
      <span className="absolute inset-x-1 top-1 border-t border-ink/30" />
      <span className="font-display text-lg font-bold leading-none tracking-[0.12em] text-ink">
        CI
      </span>
      <span className="absolute inset-x-1 bottom-1 border-b border-ink/30" />
    </span>
  );
}

export function BrandLockup({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex min-h-11 items-center gap-2 sm:gap-3">
      <PlateMark />
      <span className="flex min-w-0 flex-col justify-center leading-none">
        <span className="font-display text-base font-semibold uppercase tracking-[0.06em] text-ink sm:text-xl sm:tracking-[0.08em]">
          Carrier Intelligence
        </span>
        <span className="mt-1 hidden font-mono text-[9px] uppercase tracking-[0.16em] text-steel sm:block">
          FMCSA carrier snapshots
        </span>
      </span>
    </Link>
  );
}

export function UsdotPlate({
  usdot,
  className = "",
}: {
  usdot: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-8 shrink-0 items-stretch overflow-hidden rounded-[2px] border-2 border-ink bg-safety shadow-hard-sm ${className}`}
    >
      <span className="flex items-center border-r-2 border-ink px-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink">
        USDOT
      </span>
      <span className="flex items-center px-2.5 py-0.5 font-display text-xl font-semibold leading-none tracking-wide tabular-nums text-ink">
        {usdot}
      </span>
    </span>
  );
}
