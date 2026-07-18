'use client'

import { SkeletonPulse, SkeletonBlock } from '@/components/layout/Skeleton'

export default function StaffRouteLoading() {
  return (
    <SkeletonPulse>
      <div className="animate-in">
        {/* Header */}
        <div style={{ marginBottom: '28px' }}>
          <SkeletonBlock width="320px" height="28px" margin="0 0 8px 0" />
          <SkeletonBlock width="180px" height="16px" />
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '28px' }}>
          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <SkeletonBlock width="36px" height="36px" borderRadius="9px" />
              <div>
                <SkeletonBlock width="100px" height="24px" margin="0 0 4px 0" />
                <SkeletonBlock width="80px" height="14px" />
              </div>
            </div>
          </div>
          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <SkeletonBlock width="36px" height="36px" borderRadius="9px" />
              <div>
                <SkeletonBlock width="60px" height="24px" margin="0 0 4px 0" />
                <SkeletonBlock width="80px" height="14px" />
              </div>
            </div>
          </div>
          <div className="kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <SkeletonBlock width="36px" height="36px" borderRadius="9px" />
              <div>
                <SkeletonBlock width="60px" height="24px" margin="0 0 4px 0" />
                <SkeletonBlock width="80px" height="14px" />
              </div>
            </div>
          </div>
        </div>

        {/* Shift + Actions Panel placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
          <div className="surface-card" style={{ padding: '24px' }}>
            <SkeletonBlock width="120px" height="18px" margin="0 0 16px 0" />
            <SkeletonBlock width="100px" height="26px" margin="0 0 12px 0" borderRadius="20px" />
            <SkeletonBlock width="150px" height="14px" margin="0 0 16px 0" />
            <SkeletonBlock width="120px" height="42px" borderRadius="9px" />
          </div>
          <div className="surface-card" style={{ padding: '24px' }}>
            <SkeletonBlock width="120px" height="18px" margin="0 0 16px 0" />
            <SkeletonBlock height="42px" margin="0 0 10px 0" borderRadius="9px" />
            <SkeletonBlock height="42px" borderRadius="9px" />
          </div>
        </div>
      </div>
    </SkeletonPulse>
  )
}
