import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import PreviewWorkspace from '@/components/preview/PreviewWorkspace'
import { helpDeskPreviewPage } from '@/lib/agents/help-desk'
export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Design Preview',robots:{index:false,follow:false}}
export default async function PreviewPage({searchParams}:{searchParams:Promise<{view?:string;issue?:string;status?:string}>}){
 if(process.env.NODE_ENV!=='development')notFound()
 const {view, issue, status}=await searchParams
 const allowed=['dashboard','menu','pos','customer','tables','team','orders','reports','activity','settings','staff-alerts','inventory']
 const selected=typeof view==='string'&&(allowed.includes(view)||helpDeskPreviewPage(view))?view:'dashboard'
 return <PreviewWorkspace key={`${selected}:${status??''}:${issue??''}`} view={selected} issue={typeof issue==='string'?issue:undefined} checkFilter={status==='failed'||status==='all'?status:'waiting'}/>
}
