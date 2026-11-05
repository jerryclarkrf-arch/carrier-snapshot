export default function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-200 pb-1 mb-2">{title}</h4>
      {children}
    </div>
  );
}
