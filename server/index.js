import http from 'node:http';
import { config } from './config.js';
import { initDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createApp } from './app.js';
import { setupWebSocket } from './ws/realtime.js';

async function bootstrap() {
  const db = await initDb();
  await seedDatabase(db);

  const app = createApp();
  const server = http.createServer(app);
  setupWebSocket(server);

  server.listen(config.port, () => {
    console.log(
      `🇨🇮 AKWABA API & Web App démarrés sur ${config.appBaseUrl} (DB: ${db.isPostgres ? 'PostgreSQL Neon' : 'SQLite'}, GeniusPay: ${config.geniusPay.useLocalSimulator ? 'Sandbox Simulator' : config.geniusPay.env})`
    );
  });
}

bootstrap().catch((err) => {
  console.error('❌ Échec démarrage serveur AKWABA:', err);
  process.exit(1);
});
