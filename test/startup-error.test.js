import test from 'node:test';
import assert from 'node:assert/strict';
import { publicStartupError } from '../src/startup-error.js';

test('presenter configuration failures are actionable without exposing passwords',()=>{
  const cases=[
    ['Configurá PRESENTER_ADMIN_USERNAME y PRESENTER_ADMIN_PASSWORD juntos.','CONFIG_PRESENTER_ADMIN_PAIR'],
    ['PRESENTER_ADMIN_PASSWORD admite hasta 72 bytes.','CONFIG_PRESENTER_ADMIN_PASSWORD'],
    ['Los usuarios configurados deben tener nombres distintos.','CONFIG_USERNAME_CONFLICT'],
    ['El usuario administrador de presentadores ya existe con otro rol.','CONFIG_PRESENTER_ADMIN_CONFLICT'],
  ];
  for(const [message,code] of cases) assert.deepEqual(publicStartupError(new Error(message)),{code,message});
});

test('SQL details and unrecognized startup failures stay private',()=>{
  for(const code of ['ER_CANT_CREATE_TABLE','ER_PARSE_ERROR',undefined]) {
    const diagnostic=publicStartupError(Object.assign(new Error('secret-password SQL CREATE TABLE private'),{code}));
    assert.ok(!JSON.stringify(diagnostic).includes('secret-password'));
    assert.ok(!diagnostic.message.includes('CREATE TABLE'));
  }
});
