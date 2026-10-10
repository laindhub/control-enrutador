import test from 'node:test';
import assert from 'node:assert/strict';
import { salesFolder, aggregateSales, validDate, extractedSale } from '../src/presenter-sales.js';
test('Thursday to Wednesday folder is payable the following week after closing',()=>{
 assert.deepEqual(salesFolder('2026-10-07'),{start:'2026-10-01',end:'2026-10-07',payFrom:'2026-10-15',payTo:'2026-10-16'});
 assert.equal(salesFolder('2026-10-08').start,'2026-10-08');
 assert.deepEqual(salesFolder('2026-12-31'),{start:'2026-12-31',end:'2027-01-06',payFrom:'2027-01-14',payTo:'2027-01-15'});
});
test('folder balances preserve stored commissions and partial/extra payments',()=>{
 const sales=[{announced_date:'2026-10-02',commission:32000},{announced_date:'2026-10-07',commission:35000}];
 let folder=aggregateSales(sales,[{folder_start:'2026-10-01',amount:32000}],'2026-10-17').find(f=>f.start==='2026-10-01');
 assert.equal(folder.expected,67000);assert.equal(folder.balance,35000);assert.equal(folder.status,'Pago parcial');
 folder=aggregateSales(sales,[{folder_start:'2026-10-01',amount:70000}],'2026-10-17').find(f=>f.start==='2026-10-01');
 assert.equal(folder.balance,-3000);assert.equal(folder.status,'Pago excedente');
});
test('valid dates and extraction reject malformed values without inventing fields',()=>{
 assert.throws(()=>validDate('2026-02-30'));assert.throws(()=>validDate('2026-1-01'));
 assert.deepEqual(extractedSale({clientName:' Sandra ',quota:null}),{clientName:'Sandra',phone:'',advisor:'',presenter:'',quota:null,notes:''});
 assert.throws(()=>extractedSale({quota:-1}));
});
test('unpaid folders distinguish verification, collection and overdue',()=>{
 const sales=[{announced_date:'2026-10-02',commission:32000}];
 const status=day=>aggregateSales(sales,[],day).find(f=>f.start==='2026-10-01').status;
 assert.equal(status('2026-10-08'),'En verificación');assert.equal(status('2026-10-15'),'A cobrar');assert.equal(status('2026-10-17'),'Pago pendiente');
});
