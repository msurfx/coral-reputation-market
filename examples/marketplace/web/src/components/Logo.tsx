/** A small branching coral mark — the product's namesake, hand-drawn as simple polyp branches. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 29 V17" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 21 L10 15" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 19 L22 13" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 15 L12 9" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 13 L21 7" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="15" r="2" fill="var(--coral)" />
      <circle cx="22" cy="13" r="2" fill="var(--coral)" />
      <circle cx="12" cy="9" r="1.8" fill="var(--coral)" />
      <circle cx="21" cy="7" r="1.8" fill="var(--coral)" />
      <circle cx="16" cy="17" r="1.6" fill="var(--coral)" />
    </svg>
  )
}
