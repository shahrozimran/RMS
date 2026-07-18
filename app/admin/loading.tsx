'use client'

import { SkeletonPulse, SkeletonBlock } from '@/components/layout/Skeleton'

export default function AdminRouteLoading() {
  return (
    <SkeletonPulse>
      <div className="animate-in">
        {/* Page Header Placeholder */}
        <div style={{ marginBottom: '28px' }}>
          <SkeletonBlock width="250px" height="28px" margin="0 0 8px 0" />
          <SkeletonBlock width="400px" height="16px" />
        </div>

        {/* Filters Placeholder */}
        <div className="surface-card" style={{ padding: '16px', display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <SkeletonBlock width="160px" height="44px" borderRadius="9px" />
          <SkeletonBlock width="160px" height="44px" borderRadius="9px" />
          <SkeletonBlock width="160px" height="44px" borderRadius="9px" />
        </div>

        {/* Content Table Outline */}
        <div className="surface-card" style={{ padding: '24px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <SkeletonBlock width="15%" height="20px" />
              <SkeletonBlock width="25%" height="20px" />
              <SkeletonBlock width="20%" height="20px" />
              <SkeletonBlock width="20%" height="20px" />
              <SkeletonBlock width="20%" height="20px" />
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border, #E4DED6)' }} />
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '12px', padding: '8px 0' }}>
                <SkeletonBlock width="15%" height="16px" />
                <SkeletonBlock width="25%" height="16px" />
                <SkeletonBlock width="20%" height="16px" />
                <SkeletonBlock width="20%" height="16px" />
                <SkeletonBlock width="20%" height="16px" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonPulse>
  )
}
