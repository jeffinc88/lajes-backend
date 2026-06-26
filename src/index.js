const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const itemsRoutes = require('./routes/items');
const orcamentosRoutes = require('./routes/orcamentos');
const projetosRoutes = require('./routes/projetos');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/items', itemsRoutes);
app.use('/orcamentos', orcamentosRoutes);
app.use('/projetos', projetosRoutes);

app.get('/', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
// ─── Coach IA ──────────────────────────────────────────────
app.post('/drum-coach', async (req, res) => {
  const { message, history = [], profile = {} } = req.body;

  const systemPrompt = `Você é um coach especialista em bateria para brasileiros. 
Nível atual do aluno: ${profile.level === 1 ? 'Iniciante' : profile.level === 2 ? 'Intermediário' : 'Avançado'}.
Total de sessões: ${profile.totalSessions || 0}. Total de minutos praticados: ${profile.totalMinutes || 0}.

Seu estilo:
- Responda em português brasileiro, conversacional e encorajador
- Seja direto e prático — sem enrolação
- Se der exercício, especifique BPM, duração e padrão rítmico
- Use notação simples: D = direita, E = esquerda, B = bumbo, C = caixa, H = hi-hat
- Máximo 200 palavras por resposta
- Se o aluno parece frustrado, foque no encorajamento
- Sugira usar o metrônomo sempre que pertinente`;

  try {
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

    res.json({ reply: response.content[0].text });
  } catch (error) {
    console.error('Coach error:', error);
    res.status(500).json({ error: 'Erro ao consultar o coach' });
  }
});

// ─── Gerar nova lição ──────────────────────────────────────
app.post('/drum-generate-lesson', async (req, res) => {
  const { completedLessons = [], userLevel = 1 } = req.body;

  const prompt = `Você é um professor de bateria. Gere UMA nova lição de bateria em JSON.

Lições já concluídas pelo aluno: ${completedLessons.join(', ') || 'nenhuma'}.
Nível atual: ${userLevel === 1 ? 'Iniciante' : userLevel === 2 ? 'Intermediário' : 'Avançado'}.

Responda APENAS com JSON válido, sem texto antes ou depois:
{
  "id": "generated_${Date.now()}",
  "title": "título da lição",
  "duration": "X min",
  "level": "categoria da lição",
  "levelNum": ${userLevel},
  "content": "explicação da lição em 2-3 frases",
  "notation": "padrão rítmico usando D E B C H",
  "tip": "dica prática específica",
  "done": false
}

A lição deve ser diferente de tudo que já foi feito e adequada ao nível.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const lesson = JSON.parse(clean);
    res.json(lesson);
  } catch (error) {
    console.error('Generate lesson error:', error);
    res.status(500).json({ error: 'Erro ao gerar lição' });
  }
});

// ─── Gerar cronograma semanal ──────────────────────────────
app.post('/drum-generate-schedule', async (req, res) => {
  const { completedLessons = [], weakPoints = [], userLevel = 1, weekNumber = 1 } = req.body;

  const prompt = `Você é um professor de bateria. Gere um cronograma semanal de prática em JSON.

Semana número: ${weekNumber}
Nível: ${userLevel === 1 ? 'Iniciante' : userLevel === 2 ? 'Intermediário' : 'Avançado'}
Lições concluídas: ${completedLessons.join(', ') || 'nenhuma'}
Pontos fracos identificados: ${weakPoints.join(', ') || 'nenhum identificado ainda'}

Responda APENAS com JSON válido:
{
  "weekNumber": ${weekNumber},
  "title": "Semana ${weekNumber} — tema da semana",
  "days": [
    {
      "day": "Seg",
      "rest": false,
      "tasks": [
        { "id": "t1", "label": "nome do exercício (X min)", "done": false }
      ]
    },
    { "day": "Ter", "rest": false, "tasks": [...] },
    { "day": "Qua", "rest": true, "tasks": [] },
    { "day": "Qui", "rest": false, "tasks": [...] },
    { "day": "Sex", "rest": false, "tasks": [...] },
    { "day": "Sáb", "rest": false, "tasks": [...] },
    { "day": "Dom", "rest": true, "tasks": [] }
  ]
}

Regras: descanso quarta e domingo. Sábado é sessão longa. Progrida em relação às semanas anteriores.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const schedule = JSON.parse(clean);
    res.json(schedule);
  } catch (error) {
    console.error('Generate schedule error:', error);
    res.status(500).json({ error: 'Erro ao gerar cronograma' });
  }
});

// ─── Gerar exercício personalizado ─────────────────────────
app.post('/drum-generate-exercise', async (req, res) => {
  const { focusArea, userLevel = 1, bpm = 80 } = req.body;

  const prompt = `Gere um exercício de bateria personalizado em JSON.

Foco: ${focusArea}
Nível: ${userLevel === 1 ? 'Iniciante' : userLevel === 2 ? 'Intermediário' : 'Avançado'}
BPM atual do aluno: ${bpm}

Responda APENAS com JSON válido:
{
  "id": "ex_${Date.now()}",
  "name": "nome do exercício",
  "level": "Básico|Intermediário|Avançado",
  "bpmStart": número,
  "bpmTarget": número,
  "duration": "X min",
  "steps": [
    "passo 1 específico e claro",
    "passo 2",
    "passo 3",
    "passo 4"
  ],
  "notation": "padrão usando D E B C H",
  "category": "categoria"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const exercise = JSON.parse(clean);
    res.json(exercise);
  } catch (error) {
    console.error('Generate exercise error:', error);
    res.status(500).json({ error: 'Erro ao gerar exercício' });
  }
});
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));