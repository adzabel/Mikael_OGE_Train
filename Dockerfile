FROM node:20-slim

WORKDIR /app

# Копируем только backend для уменьшения образа
COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR /app/backend
RUN npm install --production

# Копируем весь backend-приложение
COPY backend/ ./

# Экспортируем порт, совпадающий с amvera.yml (8000)
ENV PORT=8000
EXPOSE 8000

# Запускаем node-приложение
CMD ["npm", "start"]
