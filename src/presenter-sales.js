import { DateTime } from 'luxon';
export function validDate(value) {
 const date = String(value || '');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid) throw Object.assign(new Error('Elegí una fecha válida.'), {status:400});
 return date;
}
export function salesFolder(value) {
 const day = DateTime.fromISO(validDate(value), {zone:'America/Argentina/Buenos_Aires'});
 const start = day.minus({days:(day.weekday-4+7)%7});
 return {start:start.toISODate(),end:start.plus({days:6}).toISODate(),payFrom:start.plus({days:14}).toISODate(),payTo:start.plus({days:15}).toISODate()};
}
export function money(value, allowZero = false) {
 const amount = Number(value);
 if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1) || amount > 1000000000) throw Object.assign(new Error('Ingresá un importe válido en pesos, sin centavos.'),{status:400});
 return amount;
}
export function extractedSale(input) {
 const clean = (value,max) => typeof value === 'string' ? value.trim().slice(0,max) : '';
 return {clientName:clean(input.clientName,255),phone:clean(input.phone,40),advisor:clean(input.advisor,255),presenter:clean(input.presenter,255),quota:input.quota == null ? null : money(input.quota,true),notes:clean(input.notes,2000)};
}
export function aggregateSales(sales,payments,today) {
 const folders = new Map();
 const get = date => {const f=salesFolder(date);if(!folders.has(f.start))folders.set(f.start,{...f,count:0,expected:0,paid:0,sales:[],payments:[]});return folders.get(f.start);};
 for (const sale of sales) {const f=get(sale.announced_date);f.count++;f.expected+=Number(sale.commission);f.sales.push(sale);}
 for (const payment of payments) {const f=get(payment.folder_start);f.paid+=Number(payment.amount);f.payments.push(payment);}
 get(today);
 return [...folders.values()].map(f=>({...f,balance:f.expected-f.paid,status:f.expected === 0 && f.paid === 0 ? 'Sin ventas' : f.paid > f.expected ? 'Pago excedente' : f.paid === f.expected ? 'Pagada' : f.paid > 0 ? 'Pago parcial' : today > f.payTo ? 'Pago pendiente' : today >= f.payFrom ? 'A cobrar' : today > f.end ? 'En verificación' : 'Abierta'})).sort((a,b)=>b.start.localeCompare(a.start));
}
