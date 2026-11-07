export const agentCatalog = [
  { id: 'order', name: 'Order coordination', active: true, description: 'Reviews order age and current menu availability.' },
  { id: 'kitchen', name: 'Kitchen coordination', active: true, description: 'Reviews the active queue with order and stock handoffs.' },
  { id: 'inventory', name: 'Inventory intelligence', active: true, description: 'Compares mapped ingredients with outstanding order demand.' },
  { id: 'staff', name: 'Staff allocation', active: true, description: 'Compares staff on shift with open and assigned orders.' },
  { id: 'tables', name: 'Dining floor', active: true, description: 'Checks table status, capacity and current floor availability.' },
  { id: 'sales', name: 'Sales & menu insights', active: true, description: 'Reviews paid orders and popular items from the last 30 days.' },
  { id: 'supervisor', name: 'Operations supervisor', active: true, description: 'Combines evidence into findings for administrator review.' },
] as const
