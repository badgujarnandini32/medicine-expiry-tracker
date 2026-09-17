const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');

test('user can sign up, log in, save, and fetch medicines', async () => {
  const uniqueUser = `tester${Date.now()}`;

  const signupResponse = await request(app)
    .post('/api/signup')
    .send({ username: uniqueUser, password: 'SecurePass123!' });

  assert.equal(signupResponse.status, 201);
  assert.equal(signupResponse.body.user.username, uniqueUser);

  const loginResponse = await request(app)
    .post('/api/login')
    .send({ username: uniqueUser, password: 'SecurePass123!' });

  assert.equal(loginResponse.status, 200);
  assert.ok(loginResponse.body.token);

  const medicinesResponse = await request(app)
    .get('/api/medicines')
    .set('Authorization', `Bearer ${loginResponse.body.token}`);

  assert.equal(medicinesResponse.status, 200);
  assert.ok(Array.isArray(medicinesResponse.body));

  const saveResponse = await request(app)
    .post('/api/medicines')
    .set('Authorization', `Bearer ${loginResponse.body.token}`)
    .send({
      name: 'Paracetamol',
      batch: 'BT-2048',
      manufacturingDate: '2026-01-01',
      expiryDate: '2028-01-01',
      quantity: 20
    });

  assert.equal(saveResponse.status, 201);
  assert.equal(saveResponse.body.name, 'Paracetamol');

  const savedMedicinesResponse = await request(app)
    .get('/api/medicines')
    .set('Authorization', `Bearer ${loginResponse.body.token}`);

  assert.equal(savedMedicinesResponse.status, 200);
  assert.equal(savedMedicinesResponse.body.length, 1);
  assert.equal(savedMedicinesResponse.body[0].batch, 'BT-2048');
});
