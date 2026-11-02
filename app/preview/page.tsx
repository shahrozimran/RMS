import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PreviewWorkspace from '@/components/preview/PreviewWorkspace'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Design Preview',robots:{index:false,follow:false}}
export default async function PreviewPage({searchParams}:{searchParams:Promise<{view?:string}>}){
 if(process.env.NODE_ENV!=='development')notFound()
 const {view}=await searchParams
 const allowed=['dashboard','menu','pos','customer','tables','team','orders','reports','activity','settings']
 const selected=view&&allowed.includes(view)?view:'dashboard'
 return <PreviewWorkspace key={selected} view={selected}/>
}
