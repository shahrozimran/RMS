import WorkspaceLoading from '@/components/ui/WorkspaceLoading'

// Also covers the initial protected layout's authentication check.
export default function Loading() {
  return <div style={{ padding: 32 }}><WorkspaceLoading /></div>
}
