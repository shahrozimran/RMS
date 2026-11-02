import type { CatalogData, EditableOrder } from '@/lib/api/types'
import type { DashboardProps, DashboardOrder } from '@/app/admin/dashboard/DashboardClient'
export const previewCurrency={code:'USD',symbol:'$',locale:'en-US'}
const dishes:[string,string,number,number][]=[
 ['Signature beef burger','Flame-grilled beef, aged cheddar, crisp lettuce and our house sauce.',1,16],
 ['Garden harvest salad','Seasonal greens, avocado, toasted seeds and lemon dressing.',2,13],
 ['Margherita pizza','San Marzano tomatoes, fresh mozzarella and garden basil.',1,18],
 ['Grilled chicken bowl','Herb-marinated chicken, brown rice and a colourful seasonal crunch.',1,17],
 ['Creamy mushroom pasta','Roasted mushrooms and silky parmesan cream over fresh pasta.',1,19],
 ['Crispy chicken sandwich','Golden chicken, pickled slaw and a little honey mustard.',1,15],
 ['Roasted tomato soup','Slow-roasted tomatoes, basil oil and warm sourdough.',2,9],
 ['Golden french fries','Perfectly crisp, lightly salted. A classic for a reason.',2,6],
 ['Iced oat latte','Smooth espresso, oat milk and plenty of ice.',3,6],
 ['Fresh lemonade','Freshly squeezed lemons, a touch of sweetness and garden mint.',3,5],
 ['Chocolate brownie','Rich chocolate, a soft centre and a scoop of vanilla.',4,9],
 ['Vanilla ice cream','Two scoops of a simple, beautifully creamy classic.',4,7],
]
export const previewCatalog:CatalogData={
 categories:[{id:1,name:'Main dishes'},{id:2,name:'Starters & sides'},{id:3,name:'Drinks'},{id:4,name:'Desserts'}],
 products:dishes.map(([name,description,category_id,base_price],i)=>({id:`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,name,description,category_id,base_price,price_variants:i===2?[{label:'Regular',price:18},{label:'Large',price:24}]:null,tax_rate:5,image_url:null,is_available:true,is_86d:i===11,modifiers:i===0?[{id:1,name:'Extra cheddar',price:2},{id:2,name:'Caramelised onions',price:1}]:i===8?[{id:3,name:'Extra espresso shot',price:1.5}]:[]})),
 tables:Array.from({length:12},(_,i)=>({id:i+1,table_number:`${String(i+1).padStart(2,'0')}`,section:i<8?'Main dining':'Terrace',capacity:i%3===0?6:i%2===0?2:4,status:(['occupied','free','occupied','free','reserved','occupied','cleaning','free','occupied','free','reserved','free'] as const)[i]})),
 settings:{currency:previewCurrency,service_charge:{type:'percentage',value:0}}
}
const types=['dine_in','takeaway','dine_in','delivery','dine_in','takeaway','dine_in','dine_in']
export const previewOrders:DashboardOrder[]=Array.from({length:8},(_,i)=>({id:`10${String(486-i)}d00-0000-4000-8000-000000000001`,order_type:types[i],status:i<3?'active':i===3?'billed':'paid',total:[48.3,33.6,72.45,28.35,42,56.7,65.1,23.1][i],created_at:`2026-11-02T${String(13-Math.floor(i/3)).padStart(2,'0')}:${String(52-i*6).padStart(2,'0')}:00+05:00`,staff:{name:['Amelia James','Oliver Chen','Sofia Ahmed'][i%3]},table:types[i]==='dine_in'?{table_number:['01','03','06','09'][i%4]}:null}))
export const previewDashboard:DashboardProps={todayRevenue:2486.5,todayOrderCount:64,activeOrderCount:4,staffOnlineCount:8,topItems:previewCatalog.products.slice(0,6).map((p,i)=>({product_name:p.name,qty_sold:[126,98,87,72,65,51][i]})),recentOrders:previewOrders,activeOrders:previewOrders.slice(0,4),currency:previewCurrency,preview:true}
export const previewInitialOrder:EditableOrder={order_type:'dine_in',table_id:3,customer_name:null,customer_phone:null,customer_address:null,order_items:[0,1].map(i=>({product_id:previewCatalog.products[i].id,variant_label:null,quantity:i===0?2:1,unit_price:previewCatalog.products[i].base_price,tax_rate:5,notes:null,selected_modifiers:[],product:{name:previewCatalog.products[i].name}}))}
export const previewTeam=[{name:'Amelia James',role:'Manager',email:'amelia@example.test',shift:'Morning shift',status:'Active'},{name:'Oliver Chen',role:'Cashier',email:'oliver@example.test',shift:'Morning shift',status:'Active'},{name:'Sofia Ahmed',role:'Waiter',email:'sofia@example.test',shift:'Morning shift',status:'Active'},{name:'Noah Wilson',role:'Waiter',email:'noah@example.test',shift:'Evening shift',status:'Active'},{name:'Isabella Khan',role:'Cashier',email:'isabella@example.test',shift:'Evening shift',status:'Active'},{name:'Ethan Miller',role:'Waiter',email:'ethan@example.test',shift:'Evening shift',status:'Inactive'}]
