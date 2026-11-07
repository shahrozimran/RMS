export type TeamAlert = {
  id: string
  kind: 'staff_message' | 'issue' | 'check_failed' | 'low_stock'
  title: string
  message: string
  issue_id: string | null
  created_at: string
  read_at: string | null
  sender: { name: string } | null
  recipient: { name: string } | null
}

export type AlertState = {
  installed: boolean
  inbox: TeamAlert[]
  sent: TeamAlert[]
  team: { id: string; name: string }[]
  issue: { id: string; title: string; summary: string } | null
}
