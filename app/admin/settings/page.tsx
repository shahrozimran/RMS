'use client'
import { useEffect, useState } from 'react'
import type { PosSettings, SettingEntry } from '@/lib/api/types'
import { apiGet } from '@/lib/api/client'
import SettingsWorkspace from '@/components/settings/SettingsWorkspace'
import WorkspaceLoading from '@/components/ui/WorkspaceLoading'
export default function AdminSettingsPage(){
 const [settings,setSettings]=useState<PosSettings|null>(null);const [error,setError]=useState('');const [retry,setRetry]=useState(0)
 useEffect(()=>{let active=true;apiGet<{settings:PosSettings}>('/api/settings').then(result=>{if(active)setSettings(result.settings)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[retry])
 async function save(updates:SettingEntry[]){const response=await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(updates)});if(!response.ok){const data=await response.json();throw new Error(data.error||'Unable to save settings.')}}
 if(!settings)return <WorkspaceLoading error={error} onRetry={()=>{setError('');setRetry(n=>n+1)}}/>
 return <SettingsWorkspace initial={settings} onSave={save}/>
}
