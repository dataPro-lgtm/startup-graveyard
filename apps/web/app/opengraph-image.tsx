import { ImageResponse } from 'next/og';

export const alt = 'Startup Graveyard failure intelligence platform';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        color: '#f5f7fb',
        background:
          'radial-gradient(circle at 85% 15%, #263a7a 0%, transparent 36%), linear-gradient(135deg, #090d1a 0%, #121a34 100%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 58,
            height: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #9fb3ff',
            borderRadius: 14,
            color: '#9fb3ff',
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          SG
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Startup Graveyard
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 980 }}>
        <div style={{ color: '#9fb3ff', fontSize: 24, fontWeight: 700, letterSpacing: '0.12em' }}>
          FAILURE INTELLIGENCE
        </div>
        <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em' }}>
          Learn from startup failure like it is a dataset.
        </div>
        <div style={{ color: '#b8c3df', fontSize: 28, lineHeight: 1.35 }}>
          Structured cases, grounded research, and reusable decision workflows.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, color: '#d7def2', fontSize: 20 }}>
        <span>Cases UI</span>
        <span>Research Hub</span>
        <span>Failure Copilot</span>
        <span>Reports</span>
      </div>
    </div>,
    size,
  );
}
