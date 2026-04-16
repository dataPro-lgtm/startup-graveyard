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
        <AuthProvider>
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
              Startup Graveyard
            </a>
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
            <a href="/admin/dashboard" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
              Ops Dashboard
            </a>
            <a href="/admin/reviews" style={{ color: '#9fb3ff', textDecoration: 'none' }}>
              Review Queue
            </a>
            <UserNav />
          </header>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
