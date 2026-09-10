import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationForUser } from '../src/navigation.js';

test('la cuenta demo que entra a la raíz vuelve a /demo sin crear un bucle', () => {
  assert.equal(destinationForUser({ role: 'demo' }), '/demo');
  assert.equal(destinationForUser({ role: 'ai_demo' }), '/demo');
  assert.notEqual(destinationForUser({ role: 'demo' }), '/');
});

test('cada rol tiene un destino seguro y nunca se redirige a sí mismo por defecto', () => {
  assert.equal(destinationForUser({ role: 'demo' }), '/demo');
  assert.equal(destinationForUser({ role: 'advisor' }, { alphaEnabled: false }), '/login');
  assert.equal(destinationForUser({ role: 'admin' }, { alphaEnabled: false }), '/admin');
  assert.equal(destinationForUser({ role: 'router' }, { alphaEnabled: false }), '/operator');
  assert.equal(destinationForUser({ role: 'router' }, { alphaEnabled: false, hasOperator: true }), '/');
  assert.equal(destinationForUser({ role: 'router' }, { alphaEnabled: true }), '/demo');
});
