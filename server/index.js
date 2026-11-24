import http from 'node:http';
import { config } from './config.js';
import { getDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { createApp } from './app.js';
import { setupWebSocket } from './ws/realtime.js';

getDb();
seedDatabase();

const app = createApp();
const server = http.createServer(app);
setupWebSocket(server);

server.listen(config.port, () => {
  console.log(`🇨🇮 AKWABA API & Web App démarrés sur ${config.appBaseUrl} (GeniusPay: ${config.geniusPay.useLocalSimulator ? 'Sandbox Simulator' : config.geniusPay.env})`);
});
