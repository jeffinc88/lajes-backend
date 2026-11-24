// Configuração do programa de laje (SKUs, perdas, limite de vão): todo logado lê, só o admin grava. Banco simulado.
const test = require('node:test');
const assert = require('node:assert');
const { criarGet, criarPut } = require('../src/controllers/configProgramaController');

function poolCom(rows) {
  const p = { chamadas: [], query: async (sql, params) => { p.chamadas.push({ sql, params }); return { rows }; } };
  return p;
}
function res() {
  return {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const DADOS = { de_para: { 'vigota:TR12645': 7 }, perdas: { eps: 5 }, limites: { vao_alerta_cm: 500 } };

test('get sem linha devolve dados null', async () => {
  const r = res();
  await criarGet(poolCom([]))({ user: { id: 1, role: 'vendedor' } }, r);
  assert.deepStrictEqual(r.body, { dados: null, atualizado_em: null });
});

test('get devolve dados gravados', async () => {
  const r = res();
  await criarGet(poolCom([{ dados: DADOS, atualizado_em: 'x' }]))({ user: { id: 1, role: 'vendedor' } }, r);
  assert.deepStrictEqual(r.body, { dados: DADOS, atualizado_em: 'x' });
});

test('put de vendedor recebe 403', async () => {
  const pool = poolCom([]);
  const r = res();
  await criarPut(pool)({ user: { id: 1, role: 'vendedor' }, body: DADOS }, r);
  assert.strictEqual(r.statusCode, 403);
  assert.strictEqual(r.body.error, 'Acesso negado.');
  assert.strictEqual(pool.chamadas.length, 0);
});

test('put sem perdas recebe 400', async () => {
  const pool = poolCom([]);
  const r = res();
  await criarPut(pool)({ user: { id: 1, role: 'admin' }, body: { de_para: {}, limites: {} } }, r);
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(pool.chamadas.length, 0);
});

test('put de admin grava e devolve', async () => {
  const pool = poolCom([{ dados: DADOS, atualizado_em: 'y' }]);
  const r = res();
  await criarPut(pool)({ user: { id: 9, role: 'admin' }, body: DADOS }, r);
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(pool.chamadas[0].params, [JSON.stringify(DADOS), 9]);
  assert.deepStrictEqual(r.body, { dados: DADOS, atualizado_em: 'y' });
});

for (const [nome, corpo] of [
  ['de_para com id vazio', { de_para: { x: null }, perdas: {}, limites: {} }],
  ['de_para com id texto', { de_para: { x: 'abc' }, perdas: {}, limites: {} }],
  ['perdas nao numericas', { de_para: {}, perdas: { eps: 'abc' }, limites: {} }],
  ['limite vazio', { de_para: {}, perdas: {}, limites: { vao_alerta_cm: null } }],
]) {
  test(`put com ${nome} recebe 400`, async () => {
    const pool = poolCom([]);
    const r = res();
    await criarPut(pool)({ user: { id: 1, role: 'admin' }, body: corpo }, r);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(pool.chamadas.length, 0);
  });
}
