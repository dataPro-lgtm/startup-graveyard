import Link from 'next/link';
export function KpiCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: 14,
        border: `1px solid ${color}33`,
        background: '#10172b',
      }}
    >
      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#9fb3ff', letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </p>
      <p style={{ margin: '0 0 4px', fontSize: 32, fontWeight: 700, color }}>{value}</p>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7ca8' }}>{sub}</p>
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none' }}>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: 14,
        border: '1px solid #1d2746',
        background: '#10172b',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 13, fontWeight: 600, color: '#9fb3ff' }}>{title}</p>
      {children}
    </div>
  );
}

export function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px dashed #2a3658',
        padding: compact ? '10px 12px' : '16px 18px',
        color: '#6b7ca8',
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      {text}
    </div>
  );
}

export function BarRow({
  label,
  value,
  max,
  color,
  sub,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  sub?: string;
}) {
  const pct = Math.max((value / max) * 100, 2);
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}
      >
        <span style={{ color: '#c8d0e5' }}>{label}</span>
        <span style={{ color: '#9fb3ff' }}>
          {value}
          {sub ? ` · ${sub}` : ''}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#1d2746' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%` }} />
      </div>
    </div>
  );
}
