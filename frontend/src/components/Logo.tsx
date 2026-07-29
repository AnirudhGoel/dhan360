// dhan360 mark — a segmented donut echoing the allocation charts, in the asset-class palette.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g transform="rotate(-90 32 32)" fill="none" strokeWidth={9} strokeLinecap="round">
        <circle cx="32" cy="32" r="24" pathLength={100} stroke="#2563eb" strokeDasharray="38 62" strokeDashoffset="0" />
        <circle cx="32" cy="32" r="24" pathLength={100} stroke="#0d9488" strokeDasharray="26 74" strokeDashoffset="-40" />
        <circle cx="32" cy="32" r="24" pathLength={100} stroke="#f59e0b" strokeDasharray="15 85" strokeDashoffset="-68" />
        <circle cx="32" cy="32" r="24" pathLength={100} stroke="#7c3aed" strokeDasharray="13 87" strokeDashoffset="-85" />
      </g>
      <circle cx="32" cy="32" r="6.5" fill="#0f172a" />
    </svg>
  );
}

export function LogoWordmark({ markSize = 28 }: { markSize?: number }) {
  return (
    <div className="flex items-center gap-2">
      <LogoMark size={markSize} />
      <div className="leading-none">
        <div className="text-xl font-bold text-ink">dhan<span className="text-brand">360</span></div>
      </div>
    </div>
  );
}
