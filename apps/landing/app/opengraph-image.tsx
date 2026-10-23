import { ImageResponse } from 'next/og';

export const alt = 'Brixx: online ordering and order management for food vendors in Ghana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** The picture shown when a Brixx link is shared on WhatsApp, X or Facebook. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(160deg, #FC5102 0%, #C93F00 55%, #7A2A06 100%)',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Brixx</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 84, lineHeight: 1.02, letterSpacing: -3, maxWidth: 900 }}>
          Easy ordering for your customers and your kitchen
        </div>
        <div style={{ fontSize: 32, marginTop: 28, opacity: 0.92 }}>
          Free to start. 2% only on online payments.
        </div>
      </div>
    </div>,
    size,
  );
}
