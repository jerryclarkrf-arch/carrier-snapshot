import { AlertIcon, CheckIcon, InfoIcon } from "@/components/icons";

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border border-alert/30 bg-alert/5 px-3 py-2 text-sm leading-5 text-alert"
    >
      <AlertIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 border border-ink/20 bg-paper/50 px-3 py-2 text-sm leading-5 text-steel"
    >
      <InfoIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 border border-authority/30 bg-authority/5 px-3 py-2 text-sm leading-5 text-authority"
    >
      <CheckIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
