# ☀️ AKWABA — Application de Rencontres Ivoirienne Innovante (Web & API prête pour Flutter)

**AKWABA** est une application web progressive (**PWA**) et une API **REST + WebSocket API-first** conçue pour les rencontres authentiques en **Côte d'Ivoire** (Abidjan par communes, Grand-Bassam, Assinie, Yamoussoukro, Bouaké, San-Pédro) et dans la **Diaspora** (Paris, Montréal, Bruxelles, Londres...), avec intégration **GeniusPay** (Wave, Orange Money, MTN MoMo, Moov Money, Carte).

---

## ✨ Innovations Clés

1. **🛡️ Le Bouclier Babi (Anti-Brouteurs natif)** :
   - Défi selfie gestuel pour obtenir le badge **Vérifié 225**.
   - Score de Confiance dynamique (0–100) décomposé (téléphone, selfie 225, voix, complétude) côté serveur.
   - Sentinelle temps réel dans le chat détectant les sollicitations financières suspectes (Wave/OM, Western Union, cartes prépayées, partage de numéros précoces).
2. **🎙️ La Voix d'Abidjan & Mode Coup de Foudre Vocal** :
   - Notes vocales animées sur chaque carte profil et messages vocaux dans le Salon Privé.
   - Option **Coup de Foudre Vocal** voilant le portrait tant que l'utilisateur n'a pas écouté la vraie voix du profil.
3. **🍲 Alchimie Culturelle « Vrai Babi » & Réactions Contextuelles** :
   - Calcul de compatibilité détaillé côté serveur (Intentions + 5 réponses culturelles ivoiriennes + centres d'intérêt + commune) avec barres explicatives et réactions directes sur chaque trait.
4. **✈️ Géographie par Communes & Passeport Babi** :
   - Filtrage par communes d'Abidjan (*Cocody/Riviera, Marcory/Zone 4, Plateau, Yopougon...*), villes de l'intérieur et hubs diaspora, plus annonce des dates d'arrivée et de retour à Abidjan.
5. **📍 Safe Dates Interactifs & Événements Babi** :
   - Catalogue de lieux publics partenaires vérifiés (Cocody, Zone 4, Assinie), modale de proposition sur mesure dans le chat avec acceptation interactive, suivi **Mes Réservations**, et billetterie payable par **GeniusPay**.
6. **🐚 Économie Hybride Cauris + Pass Flex & GeniusPay** :
   - Discussions **100 % gratuites** après match mutuel.
   - Pass accessibles en FCFA (*Pass Djô 3j à 1 000 FCFA*, *Pass Babi Gold 1 mois à 3 500 FCFA*, *Pass Diaspora VIP 9 500 FCFA*) et Cauris à l'acte (*dès 500 FCFA*), paiement **Wave, Orange Money, MTN MoMo, Moov Money & Carte** via **GeniusPay** (`HMAC-SHA256` webhooks).

---

## 📚 Documentation Complète

- **[Synthèse Marché, Tendances, Plan par Modules & Arbitrage Paiements](./docs/SYNTHESE_ET_PLAN_MODULES.md)**
- **[Spécification OpenAPI 3.0 (API v1)](./docs/api-openapi.yaml)**
- **[Architecture & Roadmap Mobile Flutter (iOS & Android)](./docs/FLUTTER_ARCHITECTURE.md)**

---

## 🚀 Installation & Lancement Local

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement (optionnel — le mode Sandbox GeniusPay fonctionne immédiatement)
cp .env.example .env

# 3. Initialiser la base SQLite et les profils de démonstration
npm run seed

# 4. Lancer le serveur Web + API + WebSocket
npm start
```

Ouvrez ensuite `http://localhost:3000` dans votre navigateur.

### Comptes démo pré-configurés (en mode `NODE_ENV=development` uniquement)
- **Kouamé (Cocody • Riviera)** : `kouame@akwaba.ci` / `Akwaba225!` (ou bouton **Explorer en tant que Kouamé**)
- **Aya (Cocody • Riviera)** : `aya@akwaba.ci` / `Akwaba225!` (ou bouton **Explorer en tant qu'Aya**)

---

## 🌐 Déploiement Production (VPS / Conteneur avec Volume Persistant)

1. Configurez `.env` avec `NODE_ENV=production` :
   - `JWT_SECRET` (chaîne aléatoire ≥ 32 caractères)
   - `ADMIN_MODERATION_SECRET` (clé secrète forte pour la console isolée `/admin`)
   - `APP_BASE_URL` & `CORS_ORIGIN` (ex. `https://akwaba.ci`)
   - `TRUST_PROXY=1` (derrière Nginx / Cloudflare / Caddy)
   - `DATA_DIR=/var/lib/akwaba/data` (stocke `akwaba.sqlite`, `uploads/`, `private_verifications/` et `backups/` hors du code)
   - Clés réelles `GENIUSPAY_*` (`GENIUSPAY_ENV=live`, `GENIUSPAY_LOCAL_SIMULATOR=false`, `GENIUSPAY_WEBHOOK_SECRET`), `WHATSAPP_*` (`WHATSAPP_LOCAL_SIMULATOR=false`), `GEMINI_API_KEY`, et `RESEND_API_KEY` (récupération de mot de passe email).
2. En `NODE_ENV=production` :
   - Aucun compte fictif ni robot n'est injecté en base (seuls les lieux *Safe Date* sont initialisés).
   - La console modération est isolée sur **`/admin`** (protégée par limitation anti-brute-force) et totalement absente de l'application membres.
3. Planifiez une sauvegarde à chaud SQLite quotidienne (cron) :
   ```bash
   npm run backup
   ```

---

## 🧪 Tests Automatisés

```bash
npm test
```

Couvre les suites API, WebSocket, sécurité et production (`tests/api.test.js` + `tests/production.test.js`).
