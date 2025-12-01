const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');

router.get('/tests/:id', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) return res.status(400).json({ error: 'invalid test id' });
  try {
    const tRes = await pool.query('SELECT id_test, name_test, type_test, difficulty_test FROM tests WHERE id_test = $1 LIMIT 1', [testId]);
    if (!tRes.rows || tRes.rows.length === 0) return res.status(404).json({ error: 'test not found' });
    res.json(tRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

router.get('/tests', async (_req, res) => {
  try {
    const tRes = await pool.query('SELECT id_test, name_test, type_test, difficulty_test FROM tests ORDER BY id_test');
    res.json(tRes.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

router.get('/tests/:id/questions', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) return res.status(400).json({ error: 'invalid test id' });
  try {
    const tRes = await pool.query('SELECT id_test FROM tests WHERE id_test = $1 LIMIT 1', [testId]);
    if (!tRes.rows || tRes.rows.length === 0) return res.status(404).json({ error: 'test not found' });

    const qRes = await pool.query('SELECT questions_id, questions_test_id, question_text, question_type FROM questions WHERE questions_test_id = $1 ORDER BY questions_id', [testId]);
    const questions = qRes.rows;

    const out = [];
    for (const q of questions) {
      const optRes = await pool.query('SELECT option_id, questions_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id', [q.questions_id]);
      const opts = optRes.rows;
      const answers = opts.map(o => o.variant_text);

      const rawType = (q.question_type || '').toString().toLowerCase();
      let normalizedType = rawType;
      if (rawType.includes('single')) normalizedType = 'single';
      else if (rawType.includes('multiple')) normalizedType = 'multiple';
      else if (rawType.includes('text')) normalizedType = 'text';

      const isCorrectFlag = (flag) => {
        if (flag === null || typeof flag === 'undefined') return false;
        const f = String(flag).trim().toLowerCase();
        return f === 'correct' || f === '1' || f === 'true';
      };

      let correct = null;
      if (normalizedType === 'single') {
        const idx = opts.findIndex(o => isCorrectFlag(o.option_flag));
        correct = idx >= 0 ? idx : null;
      } else if (normalizedType === 'multiple') {
        const arr = [];
        opts.forEach((o, i) => { if (isCorrectFlag(o.option_flag)) arr.push(i); });
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
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'database error' });
  }
});

router.post('/tests/:id/submit', async (req, res) => {
  const testId = Number(req.params.id);
  if (Number.isNaN(testId)) return res.status(400).json({ error: 'invalid test id' });
  const userAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
  try {
    const qRes = await pool.query('SELECT questions_id, question_text, question_type FROM questions WHERE questions_test_id = $1', [testId]);
    const questions = qRes.rows;

    let score = 0;
    const details = [];

    for (const q of questions) {
      const optRes = await pool.query('SELECT option_id, variant_text, option_flag FROM options WHERE questions_id = $1 ORDER BY option_id', [q.questions_id]);
      const opts = optRes.rows;

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

      const ua = userAnswers.find(a => String(a.question_id) === String(q.questions_id));
      let userAnswer = typeof ua !== 'undefined' ? ua.answer : null;

      let isCorrect = false;
      if (q.question_type === 'single') {
        isCorrect = Number(userAnswer) === Number(correct);
      } else if (q.question_type === 'multiple') {
        const uaArr = Array.isArray(userAnswer) ? userAnswer.map(Number) : [];
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

module.exports = router;
