export default function Footer() {
  return (
    <footer className="mt-auto border-t border-ink/15">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
          Data: FMCSA census · SAFER fallback · Carrier Index
        </p>
        <p className="text-xs text-steel">
          Public-record data. Verify before booking.
        </p>
      </div>
    </footer>
  );
}
