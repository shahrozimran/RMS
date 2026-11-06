export const agentCatalog = [
  { id: 'order', name: 'Order coordination', active: true, description: 'Reviews order age and current menu availability.' },
  { id: 'kitchen', name: 'Kitchen scheduling', active: false, description: 'Needs station capacity, preparation tasks and timing events.' },
  { id: 'inventory', name: 'Inventory intelligence', active: true, description: 'Compares mapped ingredients with outstanding order demand.' },
  { id: 'staff', name: 'Staff allocation', active: false, description: 'Needs skills, section coverage and task workload records.' },
  { id: 'tables', name: 'Table turnover', active: false, description: 'Needs seating, service and cleaning timestamps.' },
  { id: 'sales', name: 'Sales & menu optimization', active: false, description: 'Needs verified recipe costs and a forecasting baseline.' },
  { id: 'supervisor', name: 'Operations supervisor', active: true, description: 'Combines evidence into findings for administrator review.' },
] as const
