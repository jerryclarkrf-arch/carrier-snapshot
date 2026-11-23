import Link from "next/link";
import { BrandLockup, PlateMark } from "@/components/Plate";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="min-h-screen bg-paper lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <aside className="on-ink relative hidden overflow-hidden bg-ink px-10 py-10 text-paper lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <PlateMark />
          <span className="font-display text-2xl font-semibold uppercase tracking-[0.08em]">
            Carrier Intelligence
          </span>
        </Link>

        <div className="max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/60">
            FMCSA · USDOT / MC
          </p>
          <p className="mt-4 font-display text-5xl font-semibold leading-[0.95]">
            Know the carrier before the load moves.
          </p>
          <p className="mt-6 text-sm leading-6 text-paper/70">
            Authority, insurance, inspections, crashes, and fleet in one
            carrier snapshot.
          </p>
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper/50">
          Public-record data · verify before booking
        </p>
      </aside>

      <section className="flex min-h-screen flex-col">
        <div className="border-b-2 border-ink lg:hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <BrandLockup />
            <Link
              href="/"
              aria-label="Back to lookup"
              className="btn btn-ghost shrink-0 px-2 text-[10px]"
            >
              Back
            </Link>
          </div>
          <div className="road-rule" aria-hidden="true" />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
          <div className="w-full max-w-md">
            <div className="border-2 border-ink bg-white p-5 shadow-hard sm:p-8">
              <h1 className="font-display text-3xl font-semibold leading-none">
                {title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-steel">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
            {footer ? <div className="mt-4">{footer}</div> : null}
          </div>
        </div>

        <div className="border-t border-ink/15 px-4 py-4 lg:hidden">
          <p className="text-center font-mono text-[9px] uppercase tracking-[0.1em] text-steel">
            Public-record data · verify before booking
          </p>
        </div>
      </section>
    </main>
  );
}
