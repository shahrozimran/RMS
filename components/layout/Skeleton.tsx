import React from 'react'

export function SkeletonPulse({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ animation: 'skeleton-pulse 1.5s ease-in-out infinite', width: '100%' }}>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
      {children}
    </div>
  )
}

export function SkeletonBlock({ 
  width = '100%', 
  height = '20px', 
  borderRadius = '8px', 
  margin = '0',
  style = {}
}: { 
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  margin?: string
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      width,
      height,
      borderRadius,
      margin,
      background: 'var(--surface-muted, #E8E3DC)',
      ...style
    }} />
  )
}

export function SkeletonCard() {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid var(--border, #E4DED6)',
      borderRadius: '16px',
      overflow: 'hidden',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      <SkeletonBlock height={110} borderRadius="12px" />
      <SkeletonBlock width="80%" height="16px" />
      <SkeletonBlock width="50%" height="12px" />
      <SkeletonBlock height="34px" borderRadius="10px" style={{ marginTop: '4px' }} />
    </div>
  )
}

export function SkeletonTableRows({ count = 5, cols = 5 }: { count?: number, cols?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, rIdx) => (
        <tr key={rIdx}>
          {Array.from({ length: cols }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: '16px' }}>
              <SkeletonBlock width={cIdx === 0 ? '60px' : '90%'} height="14px" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
