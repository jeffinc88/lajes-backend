/* Visualizador da laje em 3D (Carvalho Pré-Moldados). Lê o modelo embutido em <script id="modelo">.
   Modelo em cm, eixos X/Y da planta (Y para baixo); aqui: 1 unidade = 1 m, x = X, z = Y, y = altura. */
(function () {
  "use strict";
  var M = JSON.parse(document.getElementById("modelo").textContent);
  var S = 0.01;                       // cm → m
  var PE = M.pe_direito || 280;       // pé-direito (cm)
  var CINTA = 20;                     // altura da cinta no topo da parede (cm)
  var LONG_H = 10, LONG_B = 6;        // longarina (cm)
  var ESCORA_B = 7;                   // escora (cm)
  var SAPATA_B = 12;                  // largura da sapata da vigota (cm)
  var COR = {
    parede: 0xd9d4cb, cinta: 0x5b5f66, madeira: 0xb07a43, madeira2: 0x8c5a2b, sapata: 0xa9a9a4,
    trelica: 0x4a5560, eps: 0xf6f6f2, lajota: 0xb5562f, concreto: 0x9aa0a6, viga: 0x7d838a,
    base: 0xe07b00, caixa: 0xe07b00, ancoragem: 0xe07b00, negativa: 0xd62828, travamento: 0x1f6fd6,
    contrapiso: 0xa19e98, caixa_dagua: 0x2a8fd6
  };
  var CAMADAS = [
    ["paredes", "Paredes", COR.parede], ["escoramento", "Escoramento", COR.madeira],
    ["vigotas", "Vigotas", COR.trelica], ["enchimento", "Enchimento", COR.eps],
    ["ferros", "Ferros", COR.negativa], ["capa", "Concreto (capa)", COR.concreto],
    ["etiquetas", "Nomes dos cômodos", 0x1f4e79]
  ];
  var ETAPAS = [
    ["paredes", "1. Paredes e cinta"], ["escoramento", "2. Escoramento: longarinas a cada 1,20 m e escoras a cada 80 cm"],
    ["vigotas", "3. Vigotas treliçadas"], ["enchimento", "4. Enchimento e fôrma dos maciços"],
    ["ferros", "5. Ferros: reforço, negativas e travamento"], ["capa", "6. Concreto: capa e maciços"]
  ];

  function br(n, casas) { return Number(n).toFixed(casas).replace(".", ","); }
  function $(id) { return document.getElementById(id); }

  // ---------- cena ----------
  var cont = $("cena");
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  cont.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var CEU = 0xdfe8ef;                 // céu claro, a névoa esconde a borda do terreno
  scene.background = new THREE.Color(CEU);
  scene.fog = new THREE.Fog(CEU, 60, 160);
  var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 500);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.autoRotateSpeed = 1.2;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c2cc, 0.75));
  var sol = new THREE.DirectionalLight(0xffffff, 0.75);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0004;
  scene.add(sol);
  scene.add(sol.target);

  var raiz = null;                  // grupo da opção atual
  var grupos = {};                  // camada → THREE.Group
  var clicaveis = [];
  var centro = new THREE.Vector3(), raio = 10;
  var visivel = {};
  CAMADAS.forEach(function (c) { visivel[c[0]] = true; });

  // ---------- auxiliares de geometria ----------
  function mat(cor, extra) {
    var o = { color: cor, roughness: 0.85, metalness: 0.0 };
    for (var k in (extra || {})) o[k] = extra[k];
    return new THREE.MeshStandardMaterial(o);
  }
  function forma(anel) {
    var s = new THREE.Shape();
    anel.forEach(function (p, i) { if (i === 0) s.moveTo(p[0] * S, -p[1] * S); else s.lineTo(p[0] * S, -p[1] * S); });
    return s;
  }
  // polígono da planta extrudado de z0 a z0 + h (cm)
  function extrudar(ext, furos, z0, h, material) {
    var s = forma(ext);
    (furos || []).forEach(function (f) { s.holes.push(forma(f)); });
    var g = new THREE.ExtrudeGeometry(s, { depth: h * S, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, material);
    m.position.y = z0 * S;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // instâncias de caixas: cada item = {cx, cy, cz, sx, sy, sz, ry?, rz?} em cm (centro e tamanhos)
  function caixas(itens, material, info) {
    if (!itens.length) return null;
    var g = new THREE.BoxGeometry(1, 1, 1);
    var im = new THREE.InstancedMesh(g, material, itens.length);
    var d = new THREE.Object3D();
    itens.forEach(function (it, i) {
      d.position.set(it.cx * S, it.cz * S, it.cy * S);
      d.rotation.set(0, it.ry || 0, it.rz || 0);
      d.scale.set(Math.max(it.sx, 0.1) * S, Math.max(it.sz, 0.1) * S, Math.max(it.sy, 0.1) * S);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;  // a esfera da geometria (caixa unitária na origem) não cobre as instâncias
    if (info) { im.userData.info = info; im.userData.itens = itens; clicaveis.push(im); }
    return im;
  }
  // barra (caixa fina) de (x0,y0,z0) a (x1,y1,z1) em cm
  function barra(x0, y0, z0, x1, y1, z1, esp) {
    var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    var L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, sx: L, sy: esp, sz: esp,
             ry: -Math.atan2(dy, dx), rz: Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)) };
  }
  function etiqueta(linhas, destaque) {
    var cv = document.createElement("canvas");
    var W = 512, H = 72 + 52 * (linhas.length - 1);
    cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    c.fillStyle = "rgba(255,255,255,0.93)";
    var r = 22;
    c.beginPath(); c.moveTo(r, 0); c.arcTo(W, 0, W, H, r); c.arcTo(W, H, 0, H, r); c.arcTo(0, H, 0, 0, r); c.arcTo(0, 0, W, 0, r);
    c.fill();
    c.strokeStyle = "#1f4e79"; c.lineWidth = 4; c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle";
    linhas.forEach(function (t, i) {
      c.fillStyle = i === 0 ? "#1f4e79" : (destaque && i === linhas.length - 1 ? "#c76a12" : "#3a4654");
      c.font = (i === 0 ? "bold 40px " : "34px ") + "Segoe UI, Roboto, Arial";
      var txt = t; while (c.measureText(txt).width > W - 30 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== t) txt = txt.slice(0, -1) + "…";
      c.fillText(txt, W / 2, 38 + 52 * i);
    });
    var tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 10;
    sp.scale.set(2.6, 2.6 * H / W, 1);
    return sp;
  }
  // terra batida: tom de barro com manchas, pedrisco e marcas de pneu/pegadas, desenhada num canvas (sem imagem de fora)
  function texturaTerra() {
    var N = 512, cv = document.createElement("canvas"); cv.width = cv.height = N;
    var c = cv.getContext("2d"), seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    c.fillStyle = "#9c7f5e"; c.fillRect(0, 0, N, N);
    var manchas = ["#8e7152", "#a88c6a", "#83664a", "#ae9677", "#957756"];
    for (var i = 0; i < 260; i++) {                      // manchas grandes e suaves
      var x = rnd() * N, y = rnd() * N, r = 12 + rnd() * 46;
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, manchas[i % manchas.length]); g.addColorStop(1, "rgba(156,127,94,0)");
      c.globalAlpha = 0.55; c.fillStyle = g;
      for (var dx = -N; dx <= N; dx += N) for (var dy = -N; dy <= N; dy += N) {   // costura sem emenda
        c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill();
      }
    }
    c.globalAlpha = 1;
    for (i = 0; i < 9000; i++) {                         // grãos e pedrisco
      var t = rnd();
      c.fillStyle = t < 0.45 ? "rgba(80,58,36,0.35)" : (t < 0.85 ? "rgba(214,190,150,0.35)" : "rgba(150,150,145,0.7)");
      var sz = t > 0.85 ? 1.5 + rnd() * 2.5 : 0.6 + rnd() * 1.4;
      c.fillRect(rnd() * N, rnd() * N, sz, sz);
    }
    c.strokeStyle = "rgba(110,82,52,0.18)"; c.lineWidth = 5;   // marcas de carrinho de mão
    for (i = 0; i < 4; i++) {
      var y0 = rnd() * N; c.beginPath(); c.moveTo(0, y0);
      c.bezierCurveTo(N * 0.3, y0 + (rnd() - 0.5) * 120, N * 0.7, y0 + (rnd() - 0.5) * 120, N, y0); c.stroke();
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  // ---------- canteiro: pilha de areia e betoneira (só enfeite), num canto fora da casa (bb em metros) ----------
  function canteiro(bb) {
    var g = new THREE.Group();          // enfeite: sempre à vista, fora das camadas e da montagem
    raiz.add(g);
    var x0 = bb.max.x + 1.8, z0 = bb.min.z + 3.2;          // fundo, lado direito: área livre da tela

    // pilha de areia: monte irregular
    var perfil = [];
    for (var i = 0; i <= 16; i++) {
      var t = i / 16, r = 1.05 * (1 - t);
      perfil.push(new THREE.Vector2(r, 0.7 * Math.pow(1 - Math.pow(1 - t, 2.2), 0.9) * (1 - 0.05 * t)));
    }
    perfil[perfil.length - 1].x = 0.001;
    var geo = new THREE.LatheGeometry(perfil, 40), pos = geo.attributes.position, seed = 3;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    for (i = 0; i < pos.count; i++) {                       // ondulações da areia jogada
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
      var k = 1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7) + (rnd() - 0.5) * 0.03;
      pos.setXYZ(i, x * k, y * (1 + 0.06 * Math.sin(a * 2)), z * k * 1.25);
    }
    geo.computeVertexNormals();
    var areia = new THREE.Mesh(geo, mat(0xa07c4e, { roughness: 1 }));
    areia.position.set(x0, 0, z0);
    areia.castShadow = areia.receiveShadow = true;
    areia.userData.info = "Areia";
    clicaveis.push(areia);
    g.add(areia);

    // betoneira (~400 L): cavalete, rodas, motor, tambor laranja inclinado com cremalheira
    var bet = new THREE.Group();
    var laranja = mat(0xe8781e, { roughness: 0.55, metalness: 0.2 }), cinza = mat(0x55595e, { roughness: 0.6, metalness: 0.4 });
    var preto = mat(0x222222, { roughness: 0.9 });
    function caixa(w, h, d, m, x, y, z) {
      var c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); c.position.set(x, y, z); c.castShadow = true; bet.add(c); return c;
    }
    caixa(1.5, 0.08, 0.08, cinza, 0, 0.28, -0.35);           // longarinas do chassi
    caixa(1.5, 0.08, 0.08, cinza, 0, 0.28, 0.35);
    caixa(0.08, 0.08, 0.78, cinza, -0.7, 0.28, 0);
    caixa(0.08, 0.08, 0.78, cinza, 0.55, 0.28, 0);
    caixa(0.08, 0.3, 0.08, cinza, -0.7, 0.14, -0.35);        // pés
    caixa(0.08, 0.3, 0.08, cinza, -0.7, 0.14, 0.35);
    caixa(0.08, 0.95, 0.08, laranja, 0.1, 0.78, -0.38);      // colunas do garfo do tambor
    caixa(0.08, 0.95, 0.08, laranja, 0.1, 0.78, 0.38);
    caixa(0.42, 0.3, 0.3, cinza, -0.45, 0.47, 0);            // motor
    [-0.45, 0.45].forEach(function (z) {                      // rodas
      var r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 24), preto);
      r.rotation.x = Math.PI / 2; r.position.set(0.55, 0.22, z); r.castShadow = true; bet.add(r);
    });
    var tambor = new THREE.Group();
    var pt = [[0.06, 0], [0.30, 0.02], [0.42, 0.18], [0.44, 0.40], [0.36, 0.62], [0.24, 0.80], [0.22, 0.86]]
      .map(function (q) { return new THREE.Vector2(q[0], q[1]); });
    var corpo = new THREE.Mesh(new THREE.LatheGeometry(pt, 36), laranja);
    corpo.material = laranja.clone(); corpo.material.side = THREE.DoubleSide;
    corpo.castShadow = true; tambor.add(corpo);
    var anel = new THREE.Mesh(new THREE.TorusGeometry(0.445, 0.035, 10, 40), cinza);
    anel.rotation.x = Math.PI / 2; anel.position.y = 0.34; tambor.add(anel);
    var boca = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 30), cinza);
    boca.rotation.x = Math.PI / 2; boca.position.y = 0.86; tambor.add(boca);
    tambor.position.set(0.1, 0.85, 0);
    tambor.rotation.z = -0.6;                                 // boca inclinada para cima
    bet.add(tambor);
    var volante = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24), preto);
    volante.position.set(0.1, 1.05, 0.5); bet.add(volante);
    bet.position.set(x0 + 0.2, 0, z0 - 2.6);
    bet.rotation.y = 0.7;
    bet.traverse(function (o) { if (o.isMesh) { o.userData.info = "Betoneira"; clicaveis.push(o); } });
    g.add(bet);
  }

  function centroide(anel) {
    var a = 0, x = 0, y = 0;
    for (var i = 0; i < anel.length; i++) {
      var p = anel[i], q = anel[(i + 1) % anel.length], k = p[0] * q[1] - q[0] * p[1];
      a += k; x += (p[0] + q[0]) * k; y += (p[1] + q[1]) * k;
    }
    if (Math.abs(a) < 1e-6) return anel[0];
    return [x / (3 * a), y / (3 * a)];
  }

  // ---------- quantidades (iguais às do orçamento) ----------
  function qtdPeca(op, nome) {
    return op.pecas.filter(function (p) { return p.nome === nome; })
      .reduce(function (s, p) { return s + p.qtd; }, 0);
  }
  function rotuloVigota(v) { return "Vigota " + v.trelica + " · " + br(v.comprimento / 100, 2) + " m"; }
  function ferroTxt(op, f) {
    var nome = "Ferro Ø" + String(f.diametro).replace(".", ",") + " mm";
    var uso = { base: "reforço", caixa: "reforço da caixa d'água", ancoragem: "ancoragem", negativa: "negativa",
                travamento: "travamento" }[f.uso] || f.uso;
    var dx = f.ate[0] - f.de[0], dy = f.ate[1] - f.de[1];
    return nome + " · " + uso + " · " + br(Math.sqrt(dx * dx + dy * dy) / 100, 2) + " m" +
      (f.qtd > 1 ? " (" + f.qtd + " barras)" : "") + "<br><small>Total Ø" + String(f.diametro).replace(".", ",") +
      " na obra: " + br(qtdPeca(op, nome), 2) + " m</small>";
  }

  // ---------- montar a opção ----------
  function construir(op) {
    if (raiz) { scene.remove(raiz); raiz.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); }
    raiz = new THREE.Group(); scene.add(raiz);
    grupos = {}; clicaveis = [];
    CAMADAS.forEach(function (c) { grupos[c[0]] = new THREE.Group(); raiz.add(grupos[c[0]]); });

    var lajePor = {};
    op.lajes.forEach(function (l) { lajePor[l.nome] = l; });
    var topoEnch = function (l) { return PE + op.sapata + l.altura_ench; };

    // paredes translúcidas + cinta
    var mParede = mat(COR.parede, { transparent: true, opacity: 0.55 });
    var mCinta = mat(COR.cinta);
    op.paredes.forEach(function (p) {
      var w = extrudar(p.ext, p.furos, 0, PE - CINTA, mParede); w.castShadow = false;
      grupos.paredes.add(w);
      grupos.paredes.add(extrudar(p.ext, p.furos, PE - CINTA, CINTA, mCinta));
    });
    var mViga = mat(COR.viga);
    op.vigas.forEach(function (v) {
      var l0 = op.lajes[0]; var topo = l0 ? topoEnch(l0) + l0.capa : PE + 20;
      var m = extrudar(v.contorno, [], topo - v.h, v.h, mViga);
      m.userData.info = "Viga " + esc(v.nome) + " · " + v.b + " × " + v.h + " cm"; clicaveis.push(m);
      grupos.paredes.add(m);
    });
    if (op.caixa && lajePor[op.caixa.laje]) {
      var lc = lajePor[op.caixa.laje], c0 = centroide(lc.contorno);
      var lado = Math.max(80, Math.min(140, Math.sqrt(op.caixa.litros) * 5));
      var cx = new THREE.Mesh(new THREE.CylinderGeometry(lado / 2 * S, lado / 2.3 * S, lado * 0.8 * S, 32),
                              mat(COR.caixa_dagua));
      cx.position.set(c0[0] * S, (topoEnch(lc) + lc.capa + lado * 0.4) * S, c0[1] * S);
      cx.castShadow = true;
      cx.userData.info = "Caixa d'água " + op.caixa.litros + " L"; clicaveis.push(cx);
      grupos.capa.add(cx);
    }

    // escoramento
    var longs = [], escoras = [], nEsc = 0;
    op.escoramento.forEach(function (e) {
      e.longarinas.forEach(function (s) {
        var b = barra(s[0][0], s[0][1], PE - LONG_H / 2, s[1][0], s[1][1], PE - LONG_H / 2, LONG_B);
        b.sz = LONG_H; longs.push(b);
      });
      e.escoras.forEach(function (p) {
        escoras.push({ cx: p[0], cy: p[1], cz: (PE - LONG_H) / 2, sx: ESCORA_B, sy: ESCORA_B, sz: PE - LONG_H });
        nEsc++;
      });
    });
    var g1 = caixas(longs, mat(COR.madeira), function () {
      return "Longarina de madeira · a cada 1,20 m, atravessando as vigotas · " + longs.length + " linhas"; });
    var g2 = caixas(escoras, mat(COR.madeira2), function () {
      return "Escora (pontalete) · a cada 80 cm na longarina · " + nEsc + " un"; });
    if (g1) grupos.escoramento.add(g1);
    if (g2) grupos.escoramento.add(g2);

    // vigotas: sapata de concreto + treliça (banzo superior, 2 inferiores, diagonais)
    var sapatas = [], banzos = [], diag = [];
    op.vigotas.forEach(function (v) {
      var l = lajePor[v.laje] || op.lajes[0];
      var hT = Math.max(6, l.altura_ench + 1);               // altura da treliça acima da sapata
      var z0 = PE + op.sapata, z1 = z0 + hT - 1;
      var zb = PE + op.sapata * 0.45;                       // banzos de baixo dentro da sapata de concreto
      var offs = v.dupla ? [-6, 6] : [0];
      offs.forEach(function (o) {
        var e = v.eixo + o;
        function pt(t, lado) { return v.direcao === "x" ? [t, e + lado] : [e + lado, t]; }
        var a = pt(v.inicio, 0), b = pt(v.fim, 0);
        var s = barra(a[0], a[1], PE + op.sapata / 2, b[0], b[1], PE + op.sapata / 2, SAPATA_B);
        s.sz = op.sapata; s.vigota = v; sapatas.push(s);
        var as = pt(v.inicio, 0), bs = pt(v.fim, 0);
        banzos.push(barra(as[0], as[1], z1, bs[0], bs[1], z1, 1.0));
        [-4, 4].forEach(function (lado) {
          var ai = pt(v.inicio, lado), bi = pt(v.fim, lado);
          banzos.push(barra(ai[0], ai[1], zb, bi[0], bi[1], zb, 0.6));
          var passo = 20, n = Math.max(1, Math.floor((v.fim - v.inicio) / passo));
          for (var i = 0; i < n; i++) {
            var t0 = v.inicio + i * passo, tm = t0 + passo / 2, t1 = t0 + passo;
            var p0 = pt(t0, lado), pm = pt(tm, 0), p1 = pt(t1, lado);
            diag.push(barra(p0[0], p0[1], zb, pm[0], pm[1], z1, 0.5));
            diag.push(barra(pm[0], pm[1], z1, p1[0], p1[1], zb, 0.5));
          }
        });
      });
    });
    var mS = caixas(sapatas, mat(COR.sapata), function (i) {
      var v = sapatas[i].vigota; var nome = rotuloVigota(v);
      return esc(nome) + " · " + qtdPeca(op, nome) + " un" + (v.dupla ? "<br><small>vigota dupla</small>" : "");
    });
    if (mS) grupos.vigotas.add(mS);
    var mT = mat(COR.trelica, { metalness: 0.4, roughness: 0.5 });
    [banzos, diag].forEach(function (lista) { var m = caixas(lista, mT); if (m) grupos.vigotas.add(m); });

    // enchimento (cada peça uma instância)
    var eps = [], laj = [], nomeEnch = {};
    op.pecas.forEach(function (p) { if (p.grupo === "EPS" || p.grupo === "Lajota") nomeEnch[p.grupo] = nomeEnch[p.grupo] || p.nome; });
    op.fiadas.forEach(function (f) {
      var z = PE + op.sapata;
      f.blocos.forEach(function (b) {
        var it = { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, cz: z + f.altura / 2,
                   sx: Math.max(1, b[2] - b[0] - 0.6), sy: Math.max(1, b[3] - b[1] - 0.6), sz: f.altura };
        (f.tipo === "eps" ? eps : laj).push(it);
      });
    });
    function infoEnch(grupo, rot) { return function () {
      var n = nomeEnch[grupo] || rot; return esc(n) + " · " + qtdPeca(op, n) + " un"; }; }
    var mE = caixas(eps, mat(COR.eps, { roughness: 0.95 }), infoEnch("EPS", "EPS"));
    var mL = caixas(laj, mat(COR.lajota, { roughness: 0.9 }), infoEnch("Lajota", "Lajota"));
    if (mE) grupos.enchimento.add(mE);
    if (mL) grupos.enchimento.add(mL);
    // peças cortadas por borda inclinada ou curva: formato real
    var mEf = mat(COR.eps, { roughness: 0.95 }), mLf = mat(COR.lajota, { roughness: 0.9 });
    op.fiadas.forEach(function (f) {
      (f.formas || []).forEach(function (anel) {
        var m = extrudar(anel, [], PE + op.sapata, f.altura, f.tipo === "eps" ? mEf : mLf);
        var grupo = f.tipo === "eps" ? "EPS" : "Lajota";
        m.userData.info = infoEnch(grupo, grupo)() + "<br><small>peça cortada na borda</small>";
        clicaveis.push(m);
        grupos.enchimento.add(m);
      });
    });
    // maciço preenchido: EPS cortado no comprido / meia lajota junto da parede
    (op.recortes || []).forEach(function (r) {
      var lajota = r.tipo === "meia_lajota";
      var m = extrudar(r.contorno, [], PE + op.sapata, r.altura, lajota ? mLf : mEf);
      var grupo = lajota ? "Lajota" : "EPS";
      var nomeMeia = op.pecas.filter(function (p) { return /^Meia lajota/.test(p.nome); })[0];
      m.userData.info = lajota && nomeMeia ? esc(nomeMeia.nome) + " · " + nomeMeia.qtd + " un<br><small>faixa junto da parede</small>"
        : infoEnch(grupo, grupo)() + "<br><small>" + (r.tipo === "retalho" ? "retalho de EPS" : "EPS cortado no comprido, junto da parede") + "</small>";
      clicaveis.push(m);
      grupos.enchimento.add(m);
    });
    // maciços: fôrma de madeira na etapa do enchimento, concreto na etapa da capa
    var mForma = mat(COR.madeira, { roughness: 0.9 }), mMacico = mat(COR.concreto, { roughness: 0.95 });
    (op.macicos || []).forEach(function (mc) {
      var fm = extrudar(mc.ext, mc.furos, PE, 1.8, mForma);
      fm.userData.info = "Fôrma de madeira do maciço<br><small>área sem enchimento, preenchida só com concreto</small>";
      clicaveis.push(fm);
      grupos.enchimento.add(fm);
      var l0 = op.lajes[0], alto = (l0 ? op.sapata + l0.altura_ench : 10);
      var cm = extrudar(mc.ext, mc.furos, PE, alto, mMacico);
      cm.userData.info = "Maciço de concreto<br><small>área sem enchimento</small>";
      clicaveis.push(cm);
      grupos.capa.add(cm);
    });

    // ferros em cores: reforço (laranja) junto da sapata, negativa (vermelha) em cima, travamento (azul)
    var porUso = {};
    op.ferros.forEach(function (f) {
      var l = lajePor[f.laje] || op.lajes[0];
      var z = f.uso === "negativa" ? topoEnch(l) + l.capa / 2 : (f.uso === "travamento" ? PE + op.sapata + 2 : PE + op.sapata + 1.5);
      var it = barra(f.de[0], f.de[1], z, f.ate[0], f.ate[1], z, Math.max(1.2, f.diametro / 4));
      it.ferro = f;
      (porUso[f.uso] = porUso[f.uso] || []).push(it);
    });
    Object.keys(porUso).forEach(function (uso) {
      var lista = porUso[uso];
      var m = caixas(lista, mat(COR[uso] || COR.base, { metalness: 0.3, roughness: 0.5, emissive: COR[uso] || COR.base,
                                                       emissiveIntensity: 0.25 }),
                     function (i) { return ferroTxt(op, lista[i].ferro); });
      if (m) grupos.ferros.add(m);
    });

    // capa de concreto (lajes + cinta) e etiquetas
    var mCapa = mat(COR.concreto, { transparent: true, opacity: 0.82, roughness: 0.95 });
    var topoMax = PE;
    op.lajes.forEach(function (l) {
      var m = extrudar(l.contorno, [], topoEnch(l), l.capa, mCapa);
      m.userData.info = esc(l.comodo ? l.comodo + " (" + l.nome + ")" : l.nome) + " · " + br(l.area_m2, 2) + " m²" +
        "<br><small>" + esc(l.trelica) + " · enchimento " + l.altura_ench + " cm + capa " + l.capa + " cm" +
        (l.contraflecha_cm ? " · contraflecha " + br(l.contraflecha_cm, 1) + " cm" : "") + "</small>";
      clicaveis.push(m);
      grupos.capa.add(m);
      topoMax = Math.max(topoMax, topoEnch(l) + l.capa);
    });
    op.paredes.forEach(function (p) {
      var l0 = op.lajes[0];
      grupos.capa.add(extrudar(p.ext, p.furos, PE, (l0 ? topoEnch(l0) + l0.capa : PE + 15) - PE, mCapa));
    });
    op.lajes.forEach(function (l) {
      if (l.beiral && !l.comodo) return;
      var c0 = centroide(l.contorno);
      var linhas = [l.comodo || l.nome, l.nome + " · " + br(l.area_m2, 2) + " m²"];
      if (l.contraflecha_cm) linhas.push("Contraflecha " + br(l.contraflecha_cm, 1) + " cm");
      var sp = etiqueta(linhas, !!l.contraflecha_cm);
      sp.position.set(c0[0] * S, (topoMax + 70) * S, c0[1] * S);
      sp.userData.escala = true;
      grupos.etiquetas.add(sp);
    });

    // chão
    var bb = new THREE.Box3().setFromObject(raiz);
    bb.getCenter(centro);
    var tam = bb.getSize(new THREE.Vector3());
    raio = Math.max(tam.x, tam.z, 4) * 0.6;
    scene.fog.near = raio * 4; scene.fog.far = raio * 9;
    // canteiro de obras: terra batida em volta e contrapiso de concreto sob a casa
    var lado = raio * 8, tex = texturaTerra();
    tex.repeat.set(lado / 4, lado / 4);                    // um "ladrilho" de textura a cada 4 m
    var chao = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado),
                              new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    chao.rotation.x = -Math.PI / 2; chao.position.set(centro.x, -0.02, centro.z); chao.receiveShadow = true;
    raiz.add(chao);
    var mPiso = mat(COR.contrapiso, { roughness: 0.95 });
    op.lajes.forEach(function (l) { var m = extrudar(l.contorno, [], 0, 1.5, mPiso); m.castShadow = false; raiz.add(m); });
    op.paredes.forEach(function (pp) { var m = extrudar(pp.ext, pp.furos, 0, 1.5, mPiso); m.castShadow = false; raiz.add(m); });
    canteiro(bb);
    centro.y = PE * S * 0.6;
    sol.position.set(centro.x + raio * 0.6, raio * 3.5, centro.z + raio * 0.5);
    sol.target.position.copy(centro);
    var sc = sol.shadow.camera; sc.left = sc.bottom = -raio * 1.6; sc.right = sc.top = raio * 1.6;
    sc.near = 0.5; sc.far = raio * 6; sc.updateProjectionMatrix();

    var larg = Math.max(1.6, raio * 0.28);   // etiqueta proporcional à obra
    grupos.etiquetas.children.forEach(function (sp) { var r = sp.scale.y / sp.scale.x; sp.scale.set(larg, larg * r, 1); });
    aplicarCamadas();
    cabecalho(op);
  }

  // ---------- interface ----------
  function cabecalho(op) {
    $("titulo").textContent = "Laje – " + (M.cliente || "");
    var comodos = op.lajes.filter(function (l) { return !l.beiral; }).length;
    var area = op.lajes.reduce(function (s, l) { return s + l.area_m2; }, 0);
    $("subtitulo").textContent = comodos + " cômodos · " + br(area, 2) + " m² · " + op.descricao;
    var selo = $("selo");
    selo.textContent = (op.seguranca[0] || "").replace(/:\s*$/, "");
    selo.className = "selo" + (op.norma ? "" : (op.seguranca.length > 1 ? " reduzida" : ""));
    selo.hidden = !op.seguranca.length;
  }
  function aplicarCamadas() {
    Object.keys(grupos).forEach(function (k) { grupos[k].visible = !!visivel[k]; });
  }
  var lc = $("lista-camadas");
  CAMADAS.forEach(function (c) {
    var lb = document.createElement("label");
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true;
    cb.addEventListener("change", function () { visivel[c[0]] = cb.checked; aplicarCamadas(); });
    var cor = document.createElement("i"); cor.style.background = "#" + c[2].toString(16).padStart(6, "0");
    lb.appendChild(cb); lb.appendChild(cor); lb.appendChild(document.createTextNode(c[1]));
    lc.appendChild(lb);
  });
  if (window.innerWidth > 700) $("camadas").open = true;

  var VISTAS = [
    ["Isométrica", function () { return new THREE.Vector3(1, 0.85, 1); }],
    ["Frente", function () { return new THREE.Vector3(0, 0.35, 1); }],
    ["Fundos", function () { return new THREE.Vector3(0, 0.35, -1); }],
    ["Esquerda", function () { return new THREE.Vector3(-1, 0.35, 0); }],
    ["Direita", function () { return new THREE.Vector3(1, 0.35, 0); }],
    ["De cima", function () { return new THREE.Vector3(0, 1, 0.001); }]
  ];
  function olhar(dir) {
    dir.normalize();
    var dist = raio / Math.tan(camera.fov * Math.PI / 360) * 1.05 / Math.min(1, camera.aspect * 0.9);
    camera.position.copy(centro).add(dir.multiplyScalar(dist));
    controls.target.copy(centro);
    controls.update();
  }
  var vistas = $("vistas");
  VISTAS.forEach(function (v) {
    var b = document.createElement("button"); b.textContent = v[0];
    b.addEventListener("click", function () { controls.autoRotate = false; girar.classList.remove("ativo"); olhar(v[1]()); });
    vistas.appendChild(b);
  });
  var girar = document.createElement("button"); girar.textContent = "Girar";
  girar.addEventListener("click", function () {
    controls.autoRotate = !controls.autoRotate; girar.classList.toggle("ativo", controls.autoRotate); });
  vistas.appendChild(girar);

  var sel = $("opcao");
  M.opcoes.forEach(function (o, i) {
    var op = document.createElement("option"); op.value = i; op.textContent = o.nome + (o.norma ? " ✔" : "");
    sel.appendChild(op);
  });
  sel.hidden = M.opcoes.length < 2;
  sel.addEventListener("change", function () { pararMontagem(); construir(M.opcoes[+sel.value]); });

  // peças
  $("btn-pecas").addEventListener("click", function () {
    var op = M.opcoes[+sel.value || 0];
    var h = "<h2>Peças da laje</h2><div class='seg'>" + esc(op.nome + " · " + op.descricao) + "</div>";
    op.seguranca.forEach(function (s) { h += "<div class='seg'>" + esc(s) + "</div>"; });
    var porGrupo = {};
    op.pecas.forEach(function (p) { (porGrupo[p.grupo] = porGrupo[p.grupo] || []).push(p); });
    Object.keys(porGrupo).forEach(function (g) {
      h += "<h3>" + esc(g) + "</h3><table>";
      var soma = {};
      porGrupo[g].forEach(function (p) { soma[p.nome] = soma[p.nome] || { qtd: 0, u: p.unidade }; soma[p.nome].qtd += p.qtd; });
      Object.keys(soma).forEach(function (n) {
        var s = soma[n], q = s.u === "un" ? String(s.qtd) : br(s.qtd, 2);
        h += "<tr><td>" + esc(n) + "</td><td class='q'>" + q + " " + s.u + "</td></tr>";
      });
      h += "</table>";
    });
    h += "<h3>Escoramento</h3><div class='seg'>Longarinas a cada 1,20 m e escoras a cada 80 cm, começando junto das bordas.</div>";
    $("conteudo-pecas").innerHTML = h;
    $("painel-pecas").style.display = "block";
  });
  $("fechar-pecas").addEventListener("click", function () { $("painel-pecas").style.display = "none"; });
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // toque numa peça
  var ray = new THREE.Raycaster(), ponteiro = new THREE.Vector2(), inicioToque = null, tInfo = null;
  renderer.domElement.addEventListener("pointerdown", function (e) { inicioToque = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", function (e) {
    if (!inicioToque || Math.abs(e.clientX - inicioToque[0]) + Math.abs(e.clientY - inicioToque[1]) > 8) return;
    ponteiro.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ponteiro, camera);
    var alvos = clicaveis.filter(function (o) { var p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; });
    var hit = ray.intersectObjects(alvos, false)[0];
    var box = $("info");
    if (!hit) { box.style.display = "none"; return; }
    var inf = hit.object.userData.info;
    box.innerHTML = typeof inf === "function" ? inf(hit.instanceId) : inf;
    box.style.display = "block";
    clearTimeout(tInfo); tInfo = setTimeout(function () { box.style.display = "none"; }, 5000);
  });

  // ---------- montagem: etapa por etapa (manual) ou automática ----------
  var montando = null;   // {k: etapa atual, auto: bool, token: nº da animação, timer}
  function pararMontagem() {
    if (montando) { clearTimeout(montando.timer); montando = null; }
    Object.keys(grupos).forEach(function (k) { grupos[k].position.y = 0; });
    aplicarCamadas(); $("etapa").style.display = "none"; $("montar").textContent = "▶ Montar";
  }
  function animar(g, dur, token) {
    return new Promise(function (ok) {
      var t0 = performance.now();
      g.visible = true;
      (function passo(t) {
        if (!montando || montando.token !== token) { g.position.y = 0; return ok(false); }
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        g.position.y = (1 - e) * 3;
        if (k < 1) requestAnimationFrame(passo); else ok(true);
      })(t0);
    });
  }
  function irPara(k) {
    if (!montando) return;
    clearTimeout(montando.timer);
    var antes = montando.k;
    montando.k = k;
    var token = ++montando.token;
    $("pronta").style.display = "none";
    ETAPAS.forEach(function (e, i) {
      var g = grupos[e[0]];
      g.position.y = 0;
      g.visible = i < k || (i === k && k <= antes);   // voltar: aparece sem animar
    });
    grupos.etiquetas.visible = false;
    $("etapa-txt").textContent = (k + 1) + "/" + ETAPAS.length + " · " + ETAPAS[k][1].replace(/^\d+\.\s*/, "");
    $("ant").disabled = k === 0;
    $("prox").textContent = k === ETAPAS.length - 1 ? "Concluir ✔" : "Avançar ▶";
    var anima = k > antes ? animar(grupos[ETAPAS[k][0]], 1400, token) : Promise.resolve(true);
    anima.then(function (terminou) {
      if (terminou && montando && montando.token === token && montando.auto) {
        montando.timer = setTimeout(function () { avancar(); }, 1600);
      }
    });
  }
  function avancar() {
    if (!montando) return;
    if (montando.k < ETAPAS.length - 1) { irPara(montando.k + 1); return; }
    pararMontagem();                     // fim: mostra tudo e o cartão "Laje pronta"
    var op = M.opcoes[+sel.value || 0];
    $("pronta-cliente").textContent = M.cliente || "";
    $("pronta-desc").textContent = op.descricao + (op.norma ? " · ✔ Conforme a norma" : "");
    $("pronta").style.display = "flex";
  }
  function modoAuto(liga) {
    if (!montando) return;
    montando.auto = liga;
    $("auto").textContent = liga ? "⏸ Pausar" : "⏵ Automático";
    $("auto").classList.toggle("ativo", liga);
    clearTimeout(montando.timer);
    if (liga) montando.timer = setTimeout(function () { avancar(); }, 1200);
  }
  $("montar").addEventListener("click", function () {
    if (montando) { pararMontagem(); return; }
    montando = { k: -1, auto: false, token: 0, timer: null };
    $("pronta").style.display = "none"; $("info").style.display = "none";
    $("montar").textContent = "✕ Sair";
    Object.keys(grupos).forEach(function (k) { grupos[k].visible = false; });
    $("etapa").style.display = "flex";
    modoAuto(false);
    irPara(0);
  });
  $("ant").addEventListener("click", function () { if (montando && montando.k > 0) { modoAuto(false); irPara(montando.k - 1); } });
  $("prox").addEventListener("click", function () { if (montando) { modoAuto(false); avancar(); } });
  $("auto").addEventListener("click", function () { if (montando) modoAuto(!montando.auto); });
  document.addEventListener("keydown", function (e) {
    if (!montando) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); $("prox").click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); $("ant").click(); }
    else if (e.key === "Escape") pararMontagem();
  });
  $("fechar-pronta").addEventListener("click", function () { $("pronta").style.display = "none"; aplicarCamadas(); });

  // ---------- início ----------
  if (window.LOGO) {
    ["logo", "logo2"].forEach(function (id) { $(id).src = window.LOGO; $(id).hidden = false; });
  }
  document.title = "Laje 3D – " + (M.cliente || "");
  if (!M.opcoes.length) { $("titulo").textContent = "Sem opções para mostrar"; return; }
  // atalhos no endereço (#ocultar=capa,etiquetas&vista=2) para conferir e para links
  var par = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (kv) { var p = kv.split("="); if (p[0]) par[p[0]] = decodeURIComponent(p[1] || ""); });
  (par.ocultar || "").split(",").forEach(function (k) { if (k in visivel) visivel[k] = false; });
  Array.prototype.forEach.call(lc.querySelectorAll("input"), function (cb, i) { cb.checked = visivel[CAMADAS[i][0]]; });
  construir(M.opcoes[0]);
  olhar(VISTAS[Math.min(VISTAS.length - 1, +par.vista || 0)][1]());
  if (+par.zoom > 1) { camera.position.lerp(controls.target, 1 - 1 / +par.zoom); controls.update(); }
  if (par.montar) { $("montar").click(); irPara(Math.max(0, Math.min(ETAPAS.length, +par.montar || 1) - 1)); }
  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  (function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
})();
