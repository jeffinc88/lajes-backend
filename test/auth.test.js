// Testes do login: middleware (usuário excluído é recusado) e GET /auth/me. Banco simulado.
process.env.JWT_SECRET = 'teste';
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { criarAuth } = require('../src/middleware/auth');
const { criarMe } = require('../src/controllers/authController');

const poolCom = (rows) => ({ query: async () => ({ rows }) });
const token = (extra = {}) => jwt.sign({ id: 7, name: 'Ana', email: 'ana@x.com', role: 'vendedor', mcp: false, ...extra }, 'teste');
const req = (tk, url = '/orcamentos') => ({ headers: { authorization: `Bearer ${tk}` }, originalUrl: url });
function res() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('usuario existente passa', async () => {
  let passou = false;
  await criarAuth(poolCom([{ must_change_password: false }]))(req(token()), res(), () => { passou = true; });
  assert.ok(passou);
});

test('usuario excluido recebe 401', async () => {
  let passou = false;
  const r = res();
  await criarAuth(poolCom([]))(req(token()), r, () => { passou = true; });
  assert.strictEqual(r.statusCode, 401);
  assert.strictEqual(r.body.error, 'Usuário não existe mais.');
  assert.ok(!passou);
});

test('token invalido recebe 401', async () => {
  const r = res();
  await criarAuth(poolCom([{ must_change_password: false }]))(req('lixo'), r, () => assert.fail('passou'));
  assert.strictEqual(r.statusCode, 401);
  assert.strictEqual(r.body.error, 'Token inválido.');
});

test('senha temporaria so libera troca de senha', async () => {
  const auth = criarAuth(poolCom([{ must_change_password: true }]));
  const r = res();
  await auth(req(token({ mcp: true })), r, () => assert.fail('passou'));
  assert.strictEqual(r.statusCode, 403);
  let passou = false;
  await auth(req(token({ mcp: true }), '/auth/change-password'), res(), () => { passou = true; });
  assert.ok(passou);
});

test('me devolve usuario do banco e token novo', async () => {
  const banco = { id: 7, name: 'Ana Souza', email: 'ana@x.com', role: 'vendedor', must_change_password: false };
  const r = res();
  await criarMe(poolCom([banco]))({ user: { id: 7 } }, r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.user.email, 'ana@x.com');
  assert.strictEqual(r.body.user.name, 'Ana Souza');
  assert.strictEqual(jwt.verify(r.body.token, 'teste').id, 7);
});
