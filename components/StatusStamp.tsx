const STYLES = {
  active: "border-authority bg-authority text-white",
  pending: "border-safety bg-safety text-ink",
  inactive: "border-alert bg-alert text-white",
  unknown: "border-steel/40 bg-white text-steel",
} as const;

type Tone = keyof typeof STYLES;

function toneFor(status: string): Tone {
  const value = status.trim().toLowerCase();
  if (value.includes("inactive") || value.includes("not authorized") || value.includes("out of service") || value.includes("revoked")) {
    return "inactive";
  }
  if (value.includes("pending")) {
    return "pending";
  }
  if (value.includes("active") || value.includes("authorized")) {
    return "active";
  }
  return "unknown";
}

export default function StatusStamp({
  status,
  label,
  className = "",
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = toneFor(status);
  return (
    <span
      className={`inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] whitespace-nowrap ${STYLES[tone]} ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          tone === "pending" ? "bg-ink" : tone === "unknown" ? "bg-steel" : "bg-white"
        }`}
        aria-hidden="true"
      />
      {label ?? status}
    </span>
  );
}
