export function LegalArticle({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '48px 24px 72px' }}>
      <article
        style={{
          background: '#10172b',
          border: '1px solid #1d2746',
          borderRadius: 20,
          padding: '40px 36px',
          fontSize: 14,
          lineHeight: 1.9,
          color: '#c7d3f5',
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: '0 0 6px',
            color: '#f5f7fb',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
        <p style={{ color: '#6b7ca8', fontSize: 13, margin: '0 0 28px' }}>最近更新：{updatedAt}</p>
        <style>{`
          .sg-legal h2 { font-size: 17px; font-weight: 700; color: #f5f7fb; margin: 28px 0 10px; }
          .sg-legal p { margin: 0 0 12px; }
          .sg-legal ul { margin: 0 0 12px; padding-left: 22px; }
          .sg-legal li { margin-bottom: 6px; }
          .sg-legal a { color: #5b7cff; }
        `}</style>
        <div className="sg-legal">{children}</div>
      </article>
    </main>
  );
}
