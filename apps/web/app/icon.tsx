import { ImageResponse } from 'next/og';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        color: '#f5f7fb',
        background: 'linear-gradient(145deg, #0b1020 10%, #263a7a 100%)',
        fontSize: 28,
        fontWeight: 800,
        letterSpacing: '-0.08em',
      }}
    >
      SG
    </div>,
    size,
  );
}
