import test from 'node:test';
import assert from 'node:assert/strict';
import { visitId, normalizePhone, argentinaDate, normalizeDetail } from '../src/lead-sync-data.js';
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
