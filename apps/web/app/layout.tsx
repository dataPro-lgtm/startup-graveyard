import type { Metadata, Viewport } from 'next';

const SITE_NAME = 'Startup Graveyard · 创业坟场';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://startup-graveyard.io';
const DEFAULT_DESCRIPTION =
  '失败案例情报库——收录数百家知名创业公司的失败复盘、融资数据与核心教训，帮助创始人和投资人避开已知雷区。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'zh_CN',
    url: SITE_URL,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: ['/og-default.png'],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
};

export const viewport: Viewport = {
  themeColor: '#0b1020',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body
        suppressHydrationWarning
        style={{
          fontFamily: 'Inter, ui-sans-serif, system-ui',
          margin: 0,
          background: '#0b1020',
          color: '#f5f7fb',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '12px 20px',
            borderBottom: '1px solid #1d2746',
            fontSize: 13,
          }}
        >
          {/* Logo */}
          <a
            href="/"
            style={{
              color: '#f5f7fb',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 15,
              marginRight: 'auto',
              letterSpacing: '-0.01em',
            }}
          >
            ⚰️ 创业坟场
          </a>
          <a href="/" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            案例库
          </a>
          <a href="/copilot" style={{ color: '#5b7cff', textDecoration: 'none', fontWeight: 600 }}>
            AI Copilot
          </a>
          <a href="/admin/reviews" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
            运营台
          </a>
        </header>
        {children}
      </body>
    </html>
  );
}
