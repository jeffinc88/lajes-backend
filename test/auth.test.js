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
  await criarMe(poolCom([banco]))({ user: { id: 7, iat: Math.floor(Date.now() / 1000) } }, r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.user.email, 'ana@x.com');
  assert.strictEqual(r.body.user.name, 'Ana Souza');
  assert.strictEqual(jwt.verify(r.body.token, 'teste').id, 7);
});

test('me nao renova login feito com senha ha mais de 30 dias', async () => {
  const banco = { id: 7, name: 'Ana', email: 'ana@x.com', role: 'vendedor', must_change_password: false };
  const agora = Math.floor(Date.now() / 1000);
  const r = res();
  await criarMe(poolCom([banco]))({ user: { id: 7, at: agora - 31 * 86400 } }, r);
  assert.strictEqual(r.statusCode, 401);
  const ok = res();
  await criarMe(poolCom([banco]))({ user: { id: 7, at: agora - 29 * 86400 } }, ok);
  assert.strictEqual(ok.statusCode, 200);
  assert.strictEqual(jwt.verify(ok.body.token, 'teste').at, agora - 29 * 86400);   // a renovação mantém a data do login
});

test('token antigo sem data de login usa a data do token', async () => {
  const banco = { id: 7, name: 'Ana', email: 'ana@x.com', role: 'vendedor', must_change_password: false };
  const r = res();
  await criarMe(poolCom([banco]))({ user: { id: 7, iat: Math.floor(Date.now() / 1000) - 31 * 86400 } }, r);
  assert.strictEqual(r.statusCode, 401);
});

test('login grava a data do login no token', () => {
  const { assinarToken } = require('../src/controllers/authController');
  const at = jwt.verify(assinarToken({ id: 7, name: 'Ana', email: 'a', role: 'vendedor', must_change_password: false }), 'teste').at;
  assert.ok(Math.abs(at - Math.floor(Date.now() / 1000)) < 5);
});
