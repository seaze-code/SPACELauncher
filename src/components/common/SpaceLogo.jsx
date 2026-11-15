export function SpaceLogo({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="14" fill="#09090B" />
      <rect x="1.25" y="1.25" width="61.5" height="61.5" rx="12.75" stroke="#27272A" strokeWidth="2.5" />
      <path d="M32 13L47.2 21.7L32 30.4L16.8 21.7L32 13Z" fill="#FAFAFA" />
      <path d="M16.8 26.5L30.5 34.3V50.5L16.8 42.7V26.5Z" fill="#D4D4D8" />
      <path d="M47.2 26.5L33.5 34.3V50.5L47.2 42.7V26.5Z" fill="#71717A" />
    </svg>
  );
}
