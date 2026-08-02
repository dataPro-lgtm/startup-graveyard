import type { Metadata, Viewport } from 'next';
import { AuthProvider } from './components/AuthProvider';
import { UserNav } from './components/UserNav';

const SITE_NAME = 'Startup Graveyard';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://startup-graveyard.io';
const DEFAULT_DESCRIPTION =
  'Open-source failure intelligence for founders, investors, and researchers. Explore structured startup postmortems, grounded analysis, and reusable research workflows.';

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
    locale: 'en_US',
    url: SITE_URL,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: ['/opengraph-image'],
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
    <html lang="en">
      <body
        suppressHydrationWarning
        style={{
          fontFamily: 'Inter, ui-sans-serif, system-ui',
          margin: 0,
          background: '#0b1020',
          color: '#f5f7fb',
        }}
      >
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { max-width: 100%; overflow-x: clip; }
          .sg-site-header {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 12px 20px;
            border-bottom: 1px solid #1d2746;
            font-size: 13px;
          }
          .sg-site-brand { margin-right: auto; }
          .sg-primary-nav { display: flex; align-items: center; gap: 20px; }
          .sg-user-nav { min-width: 0; }
          @media (max-width: 720px) {
            .sg-site-header { flex-wrap: wrap; gap: 10px 14px; padding: 12px 16px; }
            .sg-site-brand { max-width: 48%; }
            .sg-user-nav { max-width: 48%; margin-left: auto; }
            .sg-user-nav > a { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
            .sg-primary-nav {
              order: 3;
              width: 100%;
              justify-content: space-between;
              gap: 10px;
              padding-top: 8px;
              border-top: 1px solid #1d2746;
            }
            .sg-primary-nav a { text-align: center; }
          }
        `}</style>
        <AuthProvider>
          <header className="sg-site-header">
            <a
              className="sg-site-brand"
              href="/"
              style={{
                color: '#f5f7fb',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: '-0.01em',
              }}
            >
              Startup Graveyard
            </a>
            <nav className="sg-primary-nav" aria-label="Primary navigation">
              <a href="/" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
                Explore Cases
              </a>
              <a href="/research" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
                Research Hub
              </a>
              <a
                href="/copilot"
                style={{ color: '#5b7cff', textDecoration: 'none', fontWeight: 600 }}
              >
                Failure Copilot
              </a>
            </nav>
            <div className="sg-user-nav">
              <UserNav />
            </div>
          </header>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
