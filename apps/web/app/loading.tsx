export default function Loading() {
  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 80px' }}>
      <div
        style={{
          height: 14,
          width: 160,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #1d2746 25%, #2a3658 50%, #1d2746 75%)',
          backgroundSize: '200% 100%',
          animation: 'sg-shimmer 1.2s ease-in-out infinite',
        }}
      />
      <div style={{ height: 48, width: '72%', marginTop: 16, borderRadius: 8, background: '#151d33' }} />
      <div style={{ height: 20, width: '90%', marginTop: 12, borderRadius: 6, background: '#151d33' }} />
      <section style={{ display: 'grid', gap: 16, marginTop: 40 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 120,
              borderRadius: 16,
              border: '1px solid #1d2746',
              background: '#10172b',
              padding: 20,
              boxSizing: 'border-box',
            }}
          >
            <div style={{ height: 22, width: '40%', borderRadius: 4, background: '#1d2746' }} />
            <div style={{ height: 16, width: '100%', marginTop: 14, borderRadius: 4, background: '#1d2746' }} />
            <div style={{ height: 16, width: '85%', marginTop: 8, borderRadius: 4, background: '#1d2746' }} />
          </div>
        ))}
      </section>
      <style>{`
        @keyframes sg-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}
