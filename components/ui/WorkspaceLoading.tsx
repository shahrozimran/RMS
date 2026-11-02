import { AlertCircle, RotateCcw } from 'lucide-react'

export default function WorkspaceLoading({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  if (error) return <div className="panel loading-workspace-error"><div className="alert"><AlertCircle size={18} />{error}</div><button className="btn btn-secondary" onClick={onRetry}><RotateCcw size={15} />Try again</button></div>
  return <div className="loading-workspace" role="status" aria-label="Loading workspace"><div className="loading-bar" style={{width:180,height:30}} /><div className="loading-bar" style={{width:'40%',height:12}} /><div className="loading-workspace-cards">{[1,2,3,4,5,6].map(i => <div key={i} />)}</div><span className="small muted">Preparing your workspace…</span></div>
}
