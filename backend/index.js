require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------
// Prometheus metrics setup
// ---------------------------

// Регистр метрик
const register = new client.Registry();

// Стандартные метрики Node.js / процесса
client.collectDefaultMetrics({ register });

// Счётчик HTTP-запросов по методам/роутам/статусам
const httpRequestsTotal = new client.Counter({
  name: 'mikael_ogetrain_http_requests_total',
  help: 'Total HTTP requests to Mikael OGE Train backend',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(httpRequestsTotal);

// Middleware для инкремента счётчика запросов
app.use((req, res, next) => {
  res.on('finish', () => {
    // Чтобы не засорять метрику частыми scrape-запросами, не считаем /metrics
    if (req.path === '/metrics') return;

    httpRequestsTotal.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

// Endpoint для Prometheus
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// ---------------------------
// DB connection setup
// ---------------------------

// Поддерживаем несколько вариантов конфигурации подключения:
// 1) Строка подключения в NEON_DATABASE_URL (Neon) или DATABASE_URL
// 2) Классические переменные PGHOST/PGUSER/PGPASSWORD/PGDATABASE
let pool;
const connectionString =
  process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || null;

if (connectionString) {
  // Если используется строка подключения (например, Neon), включим SSL
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
} else {
  // Обычная конфигурация через PGHOST/PGUSER/PGPASSWORD/PGDATABASE
  pool = new Pool();
}

// ---------------------------
// Helpers
// ---------------------------

// Нормализация типа вопроса для фронтенда
function normalizeQuestionType(rawType) {
  const t = (rawType || '').toString().toLowerCase();
  if (t.includes('single')) return 'single';
  if (t.includes('multiple')) return 'multiple';
  if (t.includes('text')) return 'text';
  return t || 'single';
}

// Флаг "правильного варианта"
function isCorrectFlag(flag) {
  if (flag === null || typeof flag === 'undefined') return false;
  const f = String(flag).trim().toLowerCase();
  return f === 'correct' || f === '1' || f === 'true';
}

// ---------------------------
// API endpoints
// ---------------------------

// GET /api/tests/:id - метаинформация о тесте
app.get('/api/tests/:id', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) {
    return res.status(400).json({ error: 'invalid test id' });
  }

  try {
    const tRes = await pool.query(
      'SELECT id_test, name_test, type_test, difficulty_test FROM tests WHERE id_test = $1 LIMIT 1',
      [testId],
    );
    if (!tRes.rows || tRes.rows.length === 0) {
      return res.status(404).json({ error: 'test not found' });
    }
    res.json(tRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/tests - список тестов
app.get('/api/tests', async (req, res) => {
  try {
    const tRes = await pool.query(
      'SELECT id_test, name_test, type_test, difficulty_test FROM tests ORDER BY id_test',
    );
    res.json(tRes.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/tests/:id/questions - список вопросов с вариантами
app.get('/api/tests/:id/questions', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) {
    return res.status(400).json({ error: 'invalid test id' });
  }

  try {
    // Проверим, существует ли тест
    const tRes = await pool.query(
      'SELECT id_test FROM tests WHERE id_test = $1 LIMIT 1',
      [testId],
    );
    if (!tRes.rows || tRes.rows.length === 0) {
      return res.status(404).json({ error: 'test not found' });
    }

    const qRes = await pool.query(
      'SELECT questions_id, questions_test_id, question_text, question_type FROM questions WHERE questions_test_id = $1 ORDER BY questions_id',
      [testId],
    );
    const questions = qRes.rows;

    const out = [];
    for (const q of questions) {
      const optRes = await pool.query(
        'SELECT option_id, questions_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id',
        [q.questions_id],
      );
      const opts = optRes.rows;
      const answers = opts.map((o) => o.variant_text);

      const normalizedType = normalizeQuestionType(q.question_type);

      let correct = null;
      if (normalizedType === 'single') {
        const idx = opts.findIndex((o) => isCorrectFlag(o.option_flag));
        correct = idx >= 0 ? idx : null;
      } else if (normalizedType === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => {
          if (isCorrectFlag(o.option_flag)) arr.push(i);
        });
        correct = arr;
      } else if (normalizedType === 'text') {
        const o = opts.find((o) => isCorrectFlag(o.option_flag));
        correct = o ? o.variant_text : '';
      }

      out.push({
        questions_id: q.questions_id,
        questions_test_id: q.questions_test_id,
        question_text: q.question_text,
        question_type: normalizedType,
        answers,
        correct,
        explanation: '',
      });
    }

    // Если вопросов нет — вернём пустой массив (тест существует, вопросов пока нет)
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// POST /api/tests/:id/submit - оценить ответы пользователя
// Ожидаемый формат body: { answers: [ { question_id: <num>, answer: <index|[indexes]|text> } ] }
app.post('/api/tests/:id/submit', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) {
    return res.status(400).json({ error: 'invalid test id' });
  }
  const userAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];

  try {
    // Получаем все вопросы теста
    const qRes = await pool.query(
      'SELECT questions_id, question_text, question_type FROM questions WHERE questions_test_id = $1',
      [testId],
    );
    const questions = qRes.rows;

    let score = 0;
    const details = [];

    for (const q of questions) {
      const normalizedType = normalizeQuestionType(q.question_type);

      // Получаем варианты
      const optRes = await pool.query(
        'SELECT option_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id',
        [q.questions_id],
      );
      const opts = optRes.rows;

      // Определим правильный ответ
      let correct = null;
      if (normalizedType === 'single') {
        const idx = opts.findIndex((o) => isCorrectFlag(o.option_flag));
        correct = idx >= 0 ? idx : 0;
      } else if (normalizedType === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => {
          if (isCorrectFlag(o.option_flag)) arr.push(i);
        });
        correct = arr;
      } else if (normalizedType === 'text') {
        const o = opts.find((o) => isCorrectFlag(o.option_flag));
        correct = o ? o.variant_text : '';
      }

      // Находим ответ пользователя для этого вопроса
      const ua = userAnswers.find(
        (a) => String(a.question_id) === String(q.questions_id),
      );
      let userAnswer = typeof ua !== 'undefined' ? ua.answer : null;

      // Оценка
      let isCorrect = false;
      if (normalizedType === 'single') {
        isCorrect = Number(userAnswer) === Number(correct);
      } else if (normalizedType === 'multiple') {
        const uaArr = Array.isArray(userAnswer)
          ? userAnswer.map(Number)
          : [];
        const sortedA = [...uaArr].sort();
        const sortedB = [...correct].sort();
        isCorrect =
          sortedA.length === sortedB.length &&
          sortedA.every((v, i) => v === sortedB[i]);
      } else if (normalizedType === 'text') {
        const a = (userAnswer || '').toString().trim().toLowerCase();
        const c = (correct || '').toString().trim().toLowerCase();
        isCorrect = a === c && a !== '';
      }

      if (isCorrect) score++;

      details.push({
        question_id: q.questions_id,
        question: q.question_text,
        type: normalizedType,
        correct,
        userAnswer,
        isCorrect,
      });
    }

    const total = questions.length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

    res.json({ score, total, percentage, details });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------
// Server start
// ---------------------------

const port = process.env.PORT || 8103;
app.listen(port, () => {
  console.log(`OGE backend listening on port ${port}`);
});
