import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Order from Your Table',
  description: 'Scan to browse our menu and place your order directly from your table.',
}

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; }
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background: #0a0a0f;
            color: #f0f0f5;
            -webkit-font-smoothing: antialiased;
            overflow-x: hidden;
          }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
