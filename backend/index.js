require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Поддерживаем несколько вариантов конфигурации подключения:
// 1) Строка подключения в NEON_DATABASE_URL (Neon) или DATABASE_URL
// 2) Классические переменные PGHOST/PGUSER/PGPASSWORD/PGDATABASE
let pool;
const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || null;
if (connectionString) {
  // Если используется строка подключения (например, Neon), включим SSL
  pool = new Pool({
    connectionString,
    const out = [];
    // helper to detect correct flag (avoid matching 'not_correct')
    const isCorrectFlag = (flag) => {
      if (!flag && flag !== 0) return false;
      const f = String(flag).trim().toLowerCase();
      return f === '1' || f === 'true' || f === 'correct';
    };

    for (const q of questions) {
      const optRes = await pool.query(
        'SELECT option_id, questions_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id',
        [q.questions_id]
      );
      const opts = optRes.rows;
      const answers = opts.map(o => o.variant_text);

      // Normalize question type for frontend: single_choice -> single, multiple_choice -> multiple
      let normalizedType = (q.question_type || '').toString().toLowerCase();
      if (normalizedType.includes('single')) normalizedType = 'single';
      else if (normalizedType.includes('multiple')) normalizedType = 'multiple';
      else if (normalizedType.includes('text')) normalizedType = 'text';

      // Compute correct answer(s) based on option_flag values (exact match to 'correct' or '1'/'true')
      let correct = null;
      if (normalizedType === 'single') {
        const idx = opts.findIndex(o => isCorrectFlag(o.option_flag));
        correct = idx >= 0 ? idx : null;
      } else if (normalizedType === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => {
          if (isCorrectFlag(o.option_flag)) arr.push(i);
        });
        correct = arr;
      } else if (normalizedType === 'text') {
        const o = opts.find(o => isCorrectFlag(o.option_flag));
        correct = o ? o.variant_text : '';
      }

      out.push({
        questions_id: q.questions_id,
        questions_test_id: q.questions_test_id,
        question_text: q.question_text,
        question_type: normalizedType,
        answers,
        correct,
        explanation: ''
      });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

// GET /api/tests/:id/questions - list questions with options for a test
app.get('/api/tests/:id/questions', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) return res.status(400).json({ error: 'invalid test id' });

  try {
    // Проверим, существует ли тест
    const tRes = await pool.query('SELECT id_test FROM tests WHERE id_test = $1 LIMIT 1', [testId]);
    if (!tRes.rows || tRes.rows.length === 0) return res.status(404).json({ error: 'test not found' });

    const qRes = await pool.query('SELECT questions_id, questions_test_id, question_text, question_type FROM questions WHERE questions_test_id = $1 ORDER BY questions_id', [testId]);
    const questions = qRes.rows;

    const out = [];
    for (const q of questions) {
      const optRes = await pool.query('SELECT option_id, questions_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id', [q.questions_id]);
      const opts = optRes.rows;
      const answers = opts.map(o => o.variant_text);

      // Вычисляем correct поле аналогично прежней логике
      let correct = null;
      if (q.question_type === 'single') {
        const idx = opts.findIndex(o => {
          const f = (o.option_flag || '').toString().toLowerCase();
          return f === '1' || f === 'true' || f === 'correct';
        });
        correct = idx >= 0 ? idx : 0;
      } else if (q.question_type === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => {
          const f = (o.option_flag || '').toString().toLowerCase();
          if (f === '1' || f === 'true' || f === 'correct') arr.push(i);
        });
        correct = arr;
      } else if (q.question_type === 'text') {
        const o = opts.find(o => (o.option_flag || '').toString().toLowerCase() === 'correct');
        correct = o ? o.variant_text : '';
      }

      out.push({
        questions_id: q.questions_id,
        questions_test_id: q.questions_test_id,
        question_text: q.question_text,
        question_type: q.question_type,
        answers,
        correct,
        explanation: ''
      });
    }

    // Если вопросов нет — вернём пустой массив 200 (фронтенд может это обрабатывать),
    // но тест уже существует (мы проверили выше).
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
  if (Number.isNaN(testId)) return res.status(400).json({ error: 'invalid test id' });
  const userAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];

  try {
    // Получаем все вопросы теста
    const qRes = await pool.query('SELECT questions_id, question_text, question_type FROM questions WHERE questions_test_id = $1', [testId]);
    const questions = qRes.rows;

    let score = 0;
    const details = [];

    for (const q of questions) {
      // Получаем варианты
      const optRes = await pool.query('SELECT option_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id', [q.questions_id]);
      const opts = optRes.rows;

      // Определим правильный ответ в зависимости от типа
      let correct = null;
      if (q.question_type === 'single') {
        const idx = opts.findIndex(o => {
          const f = (o.option_flag || '').toString().toLowerCase();
          return f === '1' || f === 'true' || f === 'correct';
        });
        correct = idx >= 0 ? idx : 0;
      } else if (q.question_type === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => {
          const f = (o.option_flag || '').toString().toLowerCase();
          if (f === '1' || f === 'true' || f === 'correct') arr.push(i);
        });
        correct = arr;
      } else if (q.question_type === 'text') {
        const o = opts.find(o => (o.option_flag || '').toString().toLowerCase() === 'correct');
        correct = o ? o.variant_text : '';
      }

      // Находим ответ пользователя для этого вопроса
      const ua = userAnswers.find(a => String(a.question_id) === String(q.questions_id));
      let userAnswer = typeof ua !== 'undefined' ? ua.answer : null;

      // Оценка
      let isCorrect = false;
      if (q.question_type === 'single') {
        isCorrect = Number(userAnswer) === Number(correct);
      } else if (q.question_type === 'multiple') {
        const uaArr = Array.isArray(userAnswer) ? userAnswer.map(Number) : [];
        // Сравнение множественного набора
        const sortedA = [...uaArr].sort();
        const sortedB = [...correct].sort();
        isCorrect = sortedA.length === sortedB.length && sortedA.every((v, i) => v === sortedB[i]);
      } else if (q.question_type === 'text') {
        const a = (userAnswer || '').toString().trim().toLowerCase();
        const c = (correct || '').toString().trim().toLowerCase();
        isCorrect = a === c && a !== '';
      }

      if (isCorrect) score++;

      details.push({
        question_id: q.questions_id,
        question: q.question_text,
        type: q.question_type,
        correct,
        userAnswer,
        isCorrect
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

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`OGE backend listening on port ${port}`);
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
