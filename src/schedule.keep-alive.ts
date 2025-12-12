// src/schedule.keep-alive.ts
import axios from 'axios';

const PORT = process.env.PORT || 3000;

// Автоматически определяем URL
const getAppUrl = () => {
  // Если есть переменная в окружении — используем её (для продакшена)
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, ''); // убираем слэши в конце
  }

  // Локально — всегда http://localhost:3000
  return `http://localhost:${PORT}`;
};

const APP_URL = getAppUrl();
const KEEP_ALIVE_INTERVAL = 4.5 * 60 * 1000; // 4.5 минуты

// Пингуем ТОЛЬКО если это продакшен (не localhost)
const isProduction =
  !APP_URL.includes('localhost') && !APP_URL.includes('127.0.0.1');

let intervalId: NodeJS.Timeout | null = null;

function pingServer() {
  axios
    .get(APP_URL, { timeout: 10000 })
    .then((res) => {
      console.log(`[Keep-Alive] Пинг успешен → ${res.status} | ${APP_URL}`);
    })
    .catch((err) => {
      const message = err.response
        ? `Статус: ${err.response.status}`
        : err.code === 'ECONNREFUSED'
          ? 'Сервер недоступен'
          : err.message;
      console.error(`[Keep-Alive] Ошибка пинга → ${message}`);
    });
}

// Запускаем только в продакшене
if (isProduction) {
  console.log(`[Keep-Alive] Режим продакшена активирован`);
  console.log(`[Keep-Alive] Пинг каждые 4.5 мин → ${APP_URL}`);
  pingServer(); // первый пинг сразу
  intervalId = setInterval(pingServer, KEEP_ALIVE_INTERVAL);
} else {
  console.log(`[Keep-Alive] Локальная разработка — пинг отключён (${APP_URL})`);
  console.log(`[Keep-Alive] Для продакшена задай переменную APP_URL`);
}

// Graceful shutdown (чтобы не висел процесс)
process.on('SIGTERM', () => {
  if (intervalId) clearInterval(intervalId);
  console.log('[Keep-Alive] Остановлен');
});
process.on('SIGINT', () => {
  if (intervalId) clearInterval(intervalId);
  console.log('[Keep-Alive] Остановлен');
  process.exit();
});
