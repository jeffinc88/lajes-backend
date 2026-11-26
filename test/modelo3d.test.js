// Link 3D da laje: o programa grava o modelo (logado) e o cliente abre /3d/:codigo (público). Banco simulado.
const test = require('node:test');
const assert = require('node:assert');
const { criarSalvar, criarPagina } = require('../src/controllers/modelo3dController');

function poolCom(...respostas) {
  const p = { chamadas: [], query: async (sql, params) => {
    p.chamadas.push({ sql, params });
    const r = respostas.shift();
    if (r instanceof Error) throw r;
    return { rows: r || [] };
  } };
  return p;
}
function res() {
  return {
    statusCode: 200, body: undefined, tipo: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    type(t) { this.tipo = t; return this; },
    send(b) { this.body = b; return this; },
    set() { return this; },
  };
}
const req = (user, body, extra = {}) => ({
  user, body, params: {}, protocol: 'http', headers: { 'x-forwarded-proto': 'https' },
  get: (h) => ({ host: 'servidor.app' }[h.toLowerCase()]), ...extra,
});
const MODELO = { versao: 1, cliente: 'Ana', opcoes: [] };
const VEND = { id: 5, role: 'vendedor' };

test('salvar sem código cria um código longo e devolve o link', async () => {
  const pool = poolCom([]);
  const r = res();
  await criarSalvar(pool)(req(VEND, { modelo: MODELO }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.match(r.body.codigo, /^[A-Za-z0-9_-]{22}$/);
  assert.strictEqual(r.body.url, `https://servidor.app/3d/${r.body.codigo}`);
  assert.match(pool.chamadas[0].sql, /INSERT INTO modelos_3d/);
  assert.deepStrictEqual(pool.chamadas[0].params, [r.body.codigo, 5, JSON.stringify(MODELO)]);
});

test('salvar com código do mesmo vendedor atualiza o mesmo link', async () => {
  const pool = poolCom([{ vendedor_id: 5 }], []);
  const r = res();
  await criarSalvar(pool)(req(VEND, { modelo: MODELO, codigo: 'abcdefghijklmnopqrstuv' }), r);
  assert.strictEqual(r.body.codigo, 'abcdefghijklmnopqrstuv');
  assert.match(pool.chamadas[1].sql, /UPDATE modelos_3d/);
});

test('código de outro vendedor: cria link novo, não mexe no dele', async () => {
  const pool = poolCom([{ vendedor_id: 9 }], []);
  const r = res();
  await criarSalvar(pool)(req(VEND, { modelo: MODELO, codigo: 'abcdefghijklmnopqrstuv' }), r);
  assert.notStrictEqual(r.body.codigo, 'abcdefghijklmnopqrstuv');
  assert.match(pool.chamadas[1].sql, /INSERT INTO modelos_3d/);
});

test('admin atualiza o link de qualquer vendedor', async () => {
  const pool = poolCom([{ vendedor_id: 9 }], []);
  const r = res();
  await criarSalvar(pool)(req({ id: 1, role: 'admin' }, { modelo: MODELO, codigo: 'abcdefghijklmnopqrstuv' }), r);
  assert.strictEqual(r.body.codigo, 'abcdefghijklmnopqrstuv');
  assert.match(pool.chamadas[1].sql, /UPDATE modelos_3d/);
});

for (const [nome, corpo] of [['sem modelo', {}], ['versão errada', { modelo: { versao: 2, opcoes: [] } }],
  ['sem opções', { modelo: { versao: 1 } }]]) {
  test(`salvar ${nome} recebe 400`, async () => {
    const pool = poolCom();
    const r = res();
    await criarSalvar(pool)(req(VEND, corpo), r);
    assert.strictEqual(r.statusCode, 400);
    assert.strictEqual(pool.chamadas.length, 0);
  });
}

test('página do link: HTML único com o modelo, o three e o logo', async () => {
  const modelo = { ...MODELO, cliente: 'Ana "Zé" </script><b>' };
  const r = res();
  await criarPagina(poolCom([{ modelo }]))(req(null, null, { params: { codigo: 'x' } }), r);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.tipo, 'html');
  const m = r.body.match(/<script id="modelo" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.strictEqual(JSON.parse(m[1]).cliente, modelo.cliente);
  assert.ok(!r.body.includes('</script><b>'));
  assert.ok(r.body.includes('THREE.OrbitControls') && r.body.includes('data:image/jpeg;base64,'));
});

test('link que não existe: 404 amigável', async () => {
  const r = res();
  await criarPagina(poolCom([]))(req(null, null, { params: { codigo: 'nada' } }), r);
  assert.strictEqual(r.statusCode, 404);
  assert.match(r.body, /Link não encontrado/);
});

test('erro do banco na página: 500 sem detalhes', async () => {
  const r = res();
  const orig = console.error; console.error = () => {};
  await criarPagina(poolCom(new Error('senha do banco')))(req(null, null, { params: { codigo: 'x' } }), r);
  console.error = orig;
  assert.strictEqual(r.statusCode, 500);
  assert.ok(!String(r.body).includes('senha do banco'));
});
