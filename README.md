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
# Проверка здоровья
curl http://localhost:8000/health

# Получить элементы (требуется таблица items в базе или измените запрос в app/main.py)
curl http://localhost:8000/items
```

Деплой на Amvera:
- Amvera принимает контейнеры — при загрузке образа задайте `NEON_DATABASE_URL` в настройках окружения платформы.
- Если Amvera требует Docker registry, запушьте образ в ваш registry и используйте его в Amvera.

Замечания:
- В `app/main.py` в endpoint'е `/items` указан пример SQL-запроса `SELECT id, name, created_at FROM items` — адаптируйте под вашу схему.
- Для безопасности не храните реальные креды в репозитории; используйте секреты Amvera или переменные окружения.
