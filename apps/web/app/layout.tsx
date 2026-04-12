export const metadata = {
  title: 'Startup Graveyard',
  description: 'Failure intelligence for founders and investors',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning style={{ fontFamily: 'Inter, ui-sans-serif, system-ui', margin: 0, background: '#0b1020', color: '#f5f7fb' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 20,
            padding: '12px 20px',
            borderBottom: '1px solid #1d2746',
            fontSize: 13,
          }}
        >
          <a href="/" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            首页
          </a>
          <a href="/copilot" style={{ color: '#5b7cff', textDecoration: 'none', fontWeight: 600 }}>
            Copilot
          </a>
          <a href="/admin/reviews" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            运营台
          </a>
          <a href="/admin/cases" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            案例附件
          </a>
          <a href="/admin/audit" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            审计
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}