# Mikael OGE Train — Backend (FastAPI)

Коротко: минимальный backend на FastAPI с выборкой из вашей базы на Neon (Postgres-compatible). Сборка и запуск через `Dockerfile` — можно деплоить на Amvera как контейнер.

Файлы:
- `app/main.py`: FastAPI приложение, подключение через `NEON_DATABASE_URL` и endpoint'ы `/health` и `/items`.
- `Dockerfile`: образ для запуска с `uvicorn`.
- `requirements.txt`: зависимости.
- `.env.example`: пример переменной окружения `NEON_DATABASE_URL`.

Локальная сборка контейнера:

```bash
# Сборка образа
docker build -t mikael-oge-backend:latest .

# Запуск контейнера (подставьте строку подключения к вашей БД)
docker run -e NEON_DATABASE_URL="postgresql://user:pass@host:5432/dbname" -p 8000:8000 mikael-oge-backend:latest
```

Примеры запросов:

```bash
# Проверка здоровья / тестового API
curl https://mikael-ogetrain-karinausadba.amvera.io/api/tests

# Получить вопросы первого теста (замените `1` на нужный id)
curl https://mikael-ogetrain-karinausadba.amvera.io/api/tests/1/questions
```

Деплой на Amvera:
- Amvera принимает контейнеры — при загрузке образа задайте `NEON_DATABASE_URL` в настройках окружения платформы.
- Если Amvera требует Docker registry, запушьте образ в ваш registry и используйте его в Amvera.

Замечания:
- В `app/main.py` в endpoint'е `/items` указан пример SQL-запроса `SELECT id, name, created_at FROM items` — адаптируйте под вашу схему.
- Для безопасности не храните реальные креды в репозитории; используйте секреты Amvera или переменные окружения.

## Деплой фронтенда на GitHub Pages

Добавлен workflow GitHub Actions: `.github/workflows/deploy-pages.yml`. Он автоматически публикует статический фронтенд на GitHub Pages при пуше в ветку `main`.

- Как это работает:
  - Триггер: пуш в `main`.
  - Если в корне репозитория есть `package.json`, workflow выполнит `npm ci` и `npm run build --if-present`.
  - Затем он ищет стандартные папки сборки `build`, `dist`, `public` и публикует содержимое первой найденной.
  - Если сборочной папки нет, workflow публикует содержимое корня репозитория (за исключением `backend`, `.github`, `node_modules`, `.git`, `venv`).
  - Деплой выполняется через официальные actions: `configure-pages`, `upload-pages-artifact`, `deploy-pages` и использует `GITHUB_TOKEN`.

- Быстрая проверка и триггер:
  - Сделайте коммит и пуш в `main` — в GitHub Actions появится запуск `Deploy to GitHub Pages`.
  - Посмотреть статус и логи можно в Actions → выбранный workflow → конкретный запуск.

- Настройка публикации другой папки (например, `app/` или `app/build`):
  - Откройте `.github/workflows/deploy-pages.yml` и в шаге `Prepare artifact directory` замените строку с `rsync` на копирование нужной папки, например:

```bash
# для публикации из папки app
rsync -a --exclude='.github' --exclude='node_modules' --exclude='.git' app/ artifact/

# или если сборка лежит в app/build
cp -r app/build/* artifact/
```

- Кастомный домен (CNAME):
  - Добавьте файл `CNAME` с вашим доменом в папку, которая публикуется (например в корень репозитория или в `public/`). Workflow опубликует его вместе с остальными файлами.
  - Также можно настроить домен в Settings → Pages на GitHub.

- Примечания и рекомендации:
  - Если хотите, чтобы workflow выполнял тесты/линтеры перед деплоем, можно добавить шаги `npm test` или запуск линтеров перед подготовкой артефакта.
  - Для preview-версий из pull request'ов можно добавить отдельный workflow, который публикует превью в ветку `gh-pages` или в отдельный URL — скажите, если нужно, и я добавлю.

Если хотите — могу сразу добавить: пример publishing из `app/`, шаги CI перед деплоем или workflow для превью PR.
