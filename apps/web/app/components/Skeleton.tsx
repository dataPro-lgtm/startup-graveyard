/**
 * Shared skeleton/shimmer primitives used by all loading.tsx files.
 * Pure CSS — no client JS needed.
 */

const SHIMMER_STYLE: React.CSSProperties = {
  background: 'linear-gradient(90deg, #1d2746 25%, #2a3658 50%, #1d2746 75%)',
  backgroundSize: '400% 100%',
  animation: 'sg-shimmer 1.4s ease-in-out infinite',
  borderRadius: 6,
};

export function SkeletonLine({
  width = '100%',
  height = 16,
  style,
}: {
  width?: string | number;
  height?: number;
  style?: React.CSSProperties;
}) {
  return <div style={{ ...SHIMMER_STYLE, width, height, ...style }} />;
}

export function SkeletonCard({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: '1px solid #1d2746',
        background: '#10172b',
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

/** Injects the keyframe once per page. */
export function ShimmerKeyframes() {
  return (
    <style>{`
      @keyframes sg-shimmer {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `}</style>
  );
}

/** List of N skeleton case cards for the homepage */
export function CaseListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 80px' }}>
      <ShimmerKeyframes />

      {/* Stats banner placeholder */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 32,
          padding: '20px 24px',
          borderRadius: 12,
          background: '#0d1526',
          border: '1px solid #1d2746',
        }}
      >
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonLine height={28} width="60%" />
            <SkeletonLine height={12} width="80%" />
          </div>
        ))}
      </div>

      {/* Search bar placeholder */}
      <SkeletonLine height={44} style={{ borderRadius: 10, marginBottom: 24 }} />

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <SkeletonLine height={22} width="35%" />
              <SkeletonLine height={20} width="12%" />
            </div>
            <SkeletonLine height={14} width="95%" style={{ marginBottom: 8 }} />
            <SkeletonLine height={14} width="80%" />
          </SkeletonCard>
        ))}
      </div>
    </main>
  );
}

/** Case detail page skeleton */
export function CaseDetailSkeleton() {
  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>
      <ShimmerKeyframes />

      {/* Back link */}
      <SkeletonLine height={14} width={80} style={{ marginBottom: 28 }} />

      {/* Company name */}
      <SkeletonLine height={48} width="65%" style={{ marginBottom: 16, borderRadius: 8 }} />

      {/* Tags row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {[80, 100, 70, 90].map((w, i) => (
          <SkeletonLine key={i} height={24} width={w} style={{ borderRadius: 20 }} />
        ))}
      </div>

      {/* Summary block */}
      <SkeletonLine height={16} style={{ marginBottom: 8 }} />
      <SkeletonLine height={16} width="92%" style={{ marginBottom: 8 }} />
      <SkeletonLine height={16} width="78%" style={{ marginBottom: 32 }} />

      {/* Timeline */}
      <SkeletonLine height={22} width={140} style={{ marginBottom: 16 }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <SkeletonLine height={40} width={40} style={{ borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonLine height={16} width="30%" />
            <SkeletonLine height={14} width="90%" />
          </div>
        </div>
      ))}
    </main>
  );
}
