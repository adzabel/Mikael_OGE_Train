require('dotenv').config();
const express = require('express');
const cors = require('cors');
const testsRouter = require('./routes/tests');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', testsRouter);

app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`OGE backend listening on port ${port}`);
});
