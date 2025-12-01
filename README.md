# Mikael OGE Train — Структура и деплой

Обновлённая структура репозитория упорядочивает фронтенд и бэкенд по папкам и сохраняет работающий деплой GitHub Pages.

**Структура**
- `frontend/public/`: статический фронтенд (публикуется на GitHub Pages)
  - `index.html`: основная страница приложения (объединённая, без редиректов)
  - `assets/css/styles.css`: стили
  - `assets/js/script.js`: логика фронтенда
- `backend/`: Node.js API для тестов/вопросов (Express + Postgres)
- `Dockerfile`: контейнер для Node.js backend (порт `8000`)
- `app/main.py`: экспериментальный FastAPI-пример (не используется в текущем деплое)
- `requirements.txt`: зависимости для FastAPI-примера

**Backend (Node.js, Express)**
- Переменные окружения: `NEON_DATABASE_URL` или `DATABASE_URL` (строка подключения), либо стандартные `PG*`.
- Основные эндпоинты:
  - `/api/tests` — список тестов
  - `/api/tests/:id` — метаинформация по тесту
  - `/api/tests/:id/questions` — вопросы и варианты
  - `/api/tests/:id/submit` — проверка ответов
- Health: `/health`

**Сборка и запуск backend (Docker)**

```bash
# Сборка образа
docker build -t mikael-oge-backend:latest .

# Запуск контейнера (замените строку подключения)
docker run \
  -e NEON_DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -p 8000:8000 mikael-oge-backend:latest
```

Примеры запросов к прод API:

```bash
curl https://mikael-ogetrain-karinausadba.amvera.io/api/tests
curl https://mikael-ogetrain-karinausadba.amvera.io/api/tests/1/questions
```

**Деплой фронтенда на GitHub Pages**
- Workflow: `.github/workflows/deploy-pages.yml`
- Теперь публикуется содержимое `frontend/public/` (приоритетно). Если папки нет, используются `build`, `dist`, `public` или корень.
- Ветка публикации: `gh-pages` (через `peaceiris/actions-gh-pages`). Требуется секрет `GH_PAGES_PAT` с правами на репозиторий.

Проверка:
- Сделайте коммит и пуш в `main` — запустится `Deploy to GitHub Pages`.
- В логах шага "Prepare artifact directory" увидите `Publishing from frontend/public`.

**Кастомизация**
- Хотите публиковать из другой папки? Обновите шаг `Prepare artifact directory` в workflow.
- Нужен CNAME? Добавьте файл `CNAME` в `frontend/public/`.

**Примечания**
- `app/main.py` (FastAPI) оставлен как пример и не участвует в текущем деплое. Если потребуется переключиться на FastAPI, добавлю соответствующий Dockerfile и workflow.
