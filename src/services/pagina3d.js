// Monta a página do link 3D: um HTML só com o visualizador, o three.js (r147), o modelo e o logo — a mesma
// montagem do programa de laje (orcamento/modelo3d.py::html_3d). Os arquivos de src/visualizador3d são cópias
// dos do programa (scripts/copiar_visualizador.py no repositório do programa).
const fs = require('fs');
const path = require('path');

const PASTA = path.join(__dirname, '..', 'visualizador3d');
const ler = (nome) => fs.readFileSync(path.join(PASTA, nome), 'utf8');
const arquivos = {
  index: ler('index.html'), viewer: ler('viewer.js'), three: ler('three.min.js'), controls: ler('OrbitControls.js'),
  logo: 'data:image/jpeg;base64,' + fs.readFileSync(path.join(PASTA, 'logo.jpg')).toString('base64'),
};

// JSON dentro de <script>: nada de "</" nem "<!--" (o nome do cliente pode ter qualquer coisa)
const CARACTERES_PERIGOSOS = new RegExp('[<>&' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
const jsonSeguro = (obj) => JSON.stringify(obj).replace(CARACTERES_PERIGOSOS,
  (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const escaparHtml = (t) => String(t).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function montarHtml(modelo) {
  const titulo = escaparHtml(`Laje 3D – ${(modelo && modelo.cliente) || ''}`.replace(/ – $/, ''));
  const partes = [['/*TITULO*/', titulo], ['/*LOGO*/', jsonSeguro(arquivos.logo)], ['/*MODELO*/', jsonSeguro(modelo)],
    ['/*VIEWER*/', arquivos.viewer], ['/*CONTROLS*/', arquivos.controls], ['/*THREE*/', arquivos.three]];
  let out = arquivos.index;
  for (const [marca, valor] of partes) {
    const i = out.indexOf(marca);
    out = out.slice(0, i) + valor + out.slice(i + marca.length); // sem String.replace: "$&" no texto não vira padrão
  }
  return out;
}

const PAGINA_404 = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Laje 3D</title></head>'
  + '<body style="font-family:sans-serif;text-align:center;padding:60px 20px;color:#1d2733">'
  + '<h2>Link não encontrado</h2><p>Peça ao vendedor um link novo da sua laje em 3D.</p></body></html>';

module.exports = { montarHtml, PAGINA_404 };
