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
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));