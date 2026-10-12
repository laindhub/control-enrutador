import test from 'node:test';
import assert from 'node:assert/strict';
import { visitId, normalizePhone, argentinaDate, normalizeDetail, routerFromLeadDetail } from '../src/lead-sync-data.js';
import {readFileSync} from 'node:fs';
test('only visit detail paths yield a source identifier', () => {
 const id = '304361b4-a08f-4482-bd64-a13c48591ed5';
 assert.equal(visitId(`/floor/visits/${id}?desde=ASSIGNMENT`), id);
 assert.equal(visitId(`/floor/visits/${id}/assignment`), null);
 assert.equal(visitId('https://other.example/floor/visits/'+id), null);
});
test('announcement and local phone formats match', () => {
 assert.equal(normalizePhone('+54 9 11 6572-1929'), normalizePhone('1165721929'));
 assert.equal(normalizePhone(''), null);
});
test('source date follows Argentina at UTC midnight', () => {
 assert.equal(argentinaDate(new Date('2026-10-11T01:00:00Z')), '2026-10-10');
});
test('missing fields stay empty and repeated questionnaire labels are preserved', () => {
 const fields = [{label:'Teléfono',value:'1165721929'},{label:'Pregunta',value:'Sí'},{label:'Pregunta',value:'No'}];
 const detail = normalizeDetail({name:'Cliente',fields,timeline:'Ingreso',summary:'derivada'});
 assert.equal(detail.advisor, null); assert.equal(detail.fields.length, 3);
});

test('the enrutador comes from CRM derivación activity, not from La trajo/promotor',()=>{
 const fields=[
  {label:'La trajo',value:'entró por su cuenta'},
  {label:'Derivada a',value:'Jackeline Pernambuco'},
  {label:'Teléfono',value:'1161856892'}
 ];
 const timeline=[
  'cuestionario v5',
  '',
  'Derivación',
  '',
  '14:02',
  '',
  'Keren Botini · como Enrutador',
  '',
  'Lo que sigue —la charla, la entrevista con el asesor'
 ].join('\n');
 const detail=normalizeDetail({name:'Ejemplo',fields,timeline,summary:'Derivación'});
 assert.equal(detail.advisor,'Jackeline Pernambuco');
 assert.equal(detail.promoter,'entró por su cuenta');
 assert.equal(detail.router,'Keren Botini');
 assert.equal(routerFromLeadDetail({fields,timeline}),'Keren Botini');
});
test('read routers from already synchronized detail JSON, including accented role',()=>{
 const stored={timeline:'Derivación\n14:02\nMaría Gómez · como Enrutador\n',fields:[]};
 assert.equal(routerFromLeadDetail(stored),'María Gómez');
 assert.equal(routerFromLeadDetail({fields:[{label:'Enrutador',value:'  Nadia Pérez  '}],timeline:'Otra · como Enrutador'}),'Nadia Pérez');
 assert.equal(routerFromLeadDetail({fields:[],timeline:'Entró por su cuenta\nDerivación'}),null);
 assert.equal(routerFromLeadDetail(null),null);
});
test('linked sale panel emphasizes asesor and enrutador, never the promoter field',()=>{
 const js=readFileSync(new URL('../public/js/presenter.js',import.meta.url),'utf8');
 assert.match(js,/lead-assignment/);
 assert.ok(js.includes('lead.router||detail?.router'));
 assert.ok(!js.includes('Promotor: ${esc(lead.promoter'));
 assert.ok(js.includes('filter(f=>!/^la trajo$/i'));
});
