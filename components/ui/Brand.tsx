import { ChefHat } from 'lucide-react'

export default function Brand({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-symbol"><ChefHat size={25} strokeWidth={1.6} /></span>{!compact && <span className="brand-wordmark">RMS<span>Restaurant workspace</span></span>}</div>
}
