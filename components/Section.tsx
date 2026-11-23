export default function Section({
  title,
  meta,
  children,
  className = "",
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-ink/15 pb-2">
        <h4 className="font-display text-xl font-semibold leading-none text-ink">
          {title}
        </h4>
        {meta ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-steel">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}
