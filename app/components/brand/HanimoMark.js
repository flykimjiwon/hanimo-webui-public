'use client';

/**
 * Compact Hanimo product mark shared by the chat shell.
 * Keep the mark structural and token-driven so self-hosted workspaces can
 * recolor it without maintaining separate logo assets.
 */
export default function HanimoMark({
  size = 32,
  className = '',
  decorative = true,
  label = 'Hanimo',
}) {
  const stripeInset = Math.max(5, Math.round(size * 0.2));
  const stripeHeight = Math.max(2, Math.round(size * 0.065));

  return (
    <span
      className={`relative inline-flex flex-shrink-0 overflow-hidden ${className}`}
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: 'var(--hn-primary)',
        boxShadow: '0 5px 14px -6px color-mix(in oklch, var(--hn-primary) 78%, transparent)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: stripeInset,
          right: stripeInset,
          top: Math.round(size * 0.28),
          height: stripeHeight,
          borderRadius: 999,
          background: 'var(--hn-primary-fg)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: stripeInset,
          right: stripeInset,
          top: Math.round(size * 0.5),
          height: stripeHeight,
          borderRadius: 999,
          background: 'var(--hn-primary-fg)',
          opacity: 0.56,
        }}
      />
      <span
        style={{
          position: 'absolute',
          width: Math.max(3, Math.round(size * 0.1)),
          height: Math.max(3, Math.round(size * 0.1)),
          right: Math.round(size * 0.18),
          bottom: Math.round(size * 0.17),
          borderRadius: 999,
          background: 'var(--hn-primary-fg)',
          opacity: 0.82,
        }}
      />
    </span>
  );
}
