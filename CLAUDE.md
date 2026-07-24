# Carvalho Pré-Moldados — App de Vendas

Aplicativo de gestão comercial para fábrica de lajes pré-moldadas em Franca-SP.
Usado pela equipe de vendas para criar e gerenciar orçamentos, acompanhar projetos e visualizar desempenho.

---

## Stack

### Backend
- **Runtime:** Node.js com Express
- **Banco de dados:** PostgreSQL via Supabase
- **Deploy:** Fly.io (app `lajes-backend-verdant-starlight-8175`, região `gru`), via GitHub Actions (`.github/workflows/fly-deploy.yml`) a cada push na branch `main` do GitHub — usuário `jeffinc88`
- **Autenticação:** JWT com dois roles: `admin` e `vendedor`
- **Geração de PDF:** Feita no frontend via `expo-print` + `expo-sharing`

### Frontend
- **Framework:** React Native com Expo (pasta `grill-me/`)
- **Testes locais:** Expo Go (via QR code)
- **Build de produção:** EAS Build
- **Navegação:** React Navigation (`@react-navigation/native` + `native-stack`)
- **Estilização:** `StyleSheet` nativo do React Native (sem biblioteca externa)
- **Email:** `expo-mail-composer`
- **Compartilhamento:** `expo-sharing`

---

## Estrutura de pastas

```
Lajes App/                      ← monorepo raiz
  lajes-backend/                ← backend Node.js/Express
    src/
      controllers/              ← lógica de negócio separada das rotas
      middleware/               ← auth.js e outros middlewares
      routes/                   ← endpoints REST organizados por domínio
      index.js                  ← entry point do servidor Express
    .env                        ← variáveis locais (não vai pro Git)
    package.json

  grill-me/                     ← frontend React Native/Expo
    src/
      screens/                  ← telas do aplicativo
      components/               ← componentes reutilizáveis
      navigation/               ← configuração do React Navigation
      context/                  ← contextos React (ex: AuthContext)
      services/                 ← chamadas à API do backend
      assets/                   ← imagens e recursos estáticos
      theme.js                  ← cores, fontes e estilos globais
      logo.js                   ← logo em base64/SVG
    App.js                      ← entry point do Expo
    app.json                    ← configuração do Expo
    eas.json                    ← configuração do EAS Build
```

> **Nota para o Anton:** Antes de propor qualquer alteração, leia os arquivos existentes nas pastas acima. Padrões de nomenclatura de rotas estão em `src/routes/`. Padrões de componentes estão em `grill-me/src/components/`. Chamadas à API ficam em `grill-me/src/services/` — não criar chamadas diretamente nas screens. Estilos globais estão em `grill-me/src/theme.js` — usar as variáveis definidas lá.

---

## Banco de dados (Supabase/PostgreSQL)

### Tabelas principais
- `usuarios` — vendedores e admins com role e JWT
- `clientes` — base de clientes da fábrica
- `projetos` — agrupamento de orçamentos por cliente
- `orcamentos` — orçamentos com itens, margem e status
- `itens_orcamento` — produtos dentro de cada orçamento
- `orcamentos_perdidos` — registro de orçamentos marcados como perdidos com motivo
- `tipos_laje`
- `items`
- `item_tipos_laje`

> [PREENCHER outras tabelas que existem]

### Regras de banco
- **Nunca alterar estrutura de tabelas existentes sem uma migration explícita e aprovada**
- Alterações de schema devem ser descritas como SQL puro antes de serem aplicadas
- O Supabase é o único banco — não usar SQLite ou outro banco local

---

## Autenticação e segurança

- Todas as rotas (exceto `/login`) exigem JWT válido no header `Authorization: Bearer <token>`
- O middleware `auth.js` decodifica o token e injeta `req.user` com `{ id, role, nome }`
- Role `admin` tem acesso total; role `vendedor` vê apenas seus próprios dados
- **Nunca expor senhas, tokens ou chaves de API no código** — variáveis de ambiente ficam nos secrets do Fly.io (`fly secrets set`)

---

## Funcionalidades já implementadas

Não reimplementar nem duplicar o que já existe:

- ✅ Criação e edição de orçamentos com múltiplos itens
- ✅ Sistema de margem com cálculo automático por item e total
- ✅ Geração de PDF — versão cliente (apresentação) e versão produção (interno)
- ✅ Rastreamento de orçamentos perdidos com motivo
- ✅ Estrutura de Projetos agrupando múltiplos orçamentos por cliente
- ✅ Dashboard e ranking de vendedores
- ✅ Autenticação JWT com roles admin/vendedor

---

## Convenções de código

### Backend
- Rotas nomeadas em português-técnico seguindo o domínio do negócio (ex: `/orcamentos`, `/projetos`)
- Respostas da API sempre no formato `{ data, error, message }`
- Erros retornam HTTP status apropriado (400, 401, 403, 404, 500)
- Sem biblioteca de validação de entrada por enquanto — validação feita manualmente

### Frontend
- Componentes em PascalCase
- Nomes de telas em português refletindo o vocabulário do negócio (ex: `TelaOrcamento`, `TelaRanking`)
- Estilização via `StyleSheet` nativo do React Native — sem styled-components ou NativeWind
- PDF gerado com `expo-print` e compartilhado via `expo-sharing` ou `expo-mail-composer`

---

## O que o Anton NÃO deve fazer

- ❌ Não mover a geração de PDF para o backend — ela acontece no frontend via `expo-print` intencionalmente
- ❌ Não alterar a tabela `projetos` sem migration descrita como SQL
- ❌ Não adicionar novas dependências pesadas sem justificar no relatório de arquitetura
- ❌ Não criar sistema de autenticação novo — o JWT com roles já está funcionando
- ❌ Não fazer deploy automático — o GitHub Actions + Fly.io já cuidam disso via push na main
- ❌ Não usar `console.log` para dados sensíveis (tokens, senhas, CPFs)

---

## Variáveis de ambiente (não estão no .env local)

Ficam configuradas como secrets no Fly.io (`fly secrets list` / `fly secrets set NOME=valor -a lajes-backend-verdant-starlight-8175`).
**Nunca commitar valores reais aqui** — este arquivo vai pro Git.
Para rodar localmente, copie `.env.example` para `.env` e preencha com os valores reais
(peça ao dono do projeto ou rode `fly secrets list`):

```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/postgres
JWT_SECRET=<jwt-secret>
PORT=3000
ANTHROPIC_API_KEY=<anthropic-api-key>
[PREENCHER outras variáveis necessárias]
```

---

## Fluxo de desenvolvimento

1. Desenvolver e testar localmente
2. Push na branch `main` do repositório `jeffinc88/[PREENCHER nome do repo]`
3. O GitHub Actions detecta o push e faz deploy automático do backend no Fly.io
4. Testar frontend via Expo Go antes de gerar build EAS

---

## Contexto de negócio (importante para decisões de produto)

- Os usuários finais são vendedores e o dono da fábrica — **não são desenvolvedores**
- O vocabulário do domínio é: laje, orçamento, projeto, cliente, margem, produção
- Fábrica atende mercado de autoconstrução em Franca-SP e região
- Simplicidade de uso é prioridade — evitar fluxos com muitos passos
- PDFs gerados são enviados para clientes via WhatsApp

---

## Seções para preencher depois

Abra este arquivo e complete os trechos marcados com `[PREENCHER]`:

- [ ] Nome exato do repo no GitHub (`jeffinc88/???`) — veja em github.com/jeffinc88
- [ ] Outras tabelas do banco além das listadas — veja no painel do Supabase → Table Editor
- [ ] Outras variáveis de ambiente além de `DATABASE_URL`, `JWT_SECRET` e `PORT` — rode `fly secrets list`