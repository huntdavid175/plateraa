import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Brixx: online ordering and order management for food vendors in Ghana';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * The picture shown when a Brixx link is shared on WhatsApp, X or Facebook: the orange B on
 * black, as in the brand picture. `assets/mark.png` is made by `pnpm brand:assets`.
 */
export default async function OpengraphImage() {
  const mark = await readFile(join(process.cwd(), 'assets/mark.png'), 'base64');
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '72px 88px 72px 72px',
        background: '#000000',
        color: 'white',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%',
          maxWidth: 640,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Brixx</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, lineHeight: 1.04, letterSpacing: -2.5 }}>
            Easy ordering for your customers and your kitchen
          </div>
          <div style={{ fontSize: 30, marginTop: 28, opacity: 0.8 }}>
            Free to start. 2% only on online payments.
          </div>
        </div>
      </div>
      <img src={`data:image/png;base64,${mark}`} alt="" height={380} width={326} />
    </div>,
    size,
  );
}
