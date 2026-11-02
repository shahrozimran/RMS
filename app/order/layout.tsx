import type { Metadata } from 'next'
export const metadata: Metadata = {title:'Order from Your Table',description:'Browse our menu and order directly from your table.'}
export default function OrderLayout({children}:{children:React.ReactNode}){return <main>{children}</main>}
