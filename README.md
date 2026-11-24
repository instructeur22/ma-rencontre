# ☀️ AKWABA — Application de Rencontres Ivoirienne Innovante (Web & API prête pour Flutter)

**AKWABA** est une application web progressive (**PWA**) et une API **REST + WebSocket API-first** conçue pour les rencontres authentiques en **Côte d'Ivoire** (Abidjan par communes, Grand-Bassam, Assinie, Yamoussoukro, Bouaké, San-Pédro) et dans la **Diaspora** (Paris, Montréal, Bruxelles, Londres...), avec intégration **GeniusPay** (Wave, Orange Money, MTN MoMo, Moov Money, Carte).

---

## ✨ Innovations Clés

1. **🛡️ Le Bouclier Babi (Anti-Brouteurs natif)** :
   - Défi selfie gestuel pour obtenir le badge **Vérifié 225**.
   - Score de Confiance dynamique (0–100) calculé côté serveur.
   - Sentinelle temps réel dans le chat détectant les sollicitations financières suspectes (Wave/OM, Western Union, cartes prépayées, partage de numéros précoces).
2. **🎙️ La Voix d'Abidjan** :
   - Notes vocales intégrées sur chaque carte profil et messages vocaux dans le Salon Privé.
3. **🍲 Alchimie Culturelle « Vrai Babi »** :
   - Calcul de compatibilité réel côté serveur (Intentions + 5 réponses culturelles ivoiriennes + centres d'intérêt + commune) avec explication claire du score.
4. **✈️ Géographie par Communes & Passeport Babi** :
   - Filtrage par communes d'Abidjan (*Cocody/Riviera, Marcory/Zone 4, Plateau, Yopougon...*), villes de l'intérieur et hubs diaspora, plus annonce des dates d'arrivée à Abidjan.
5. **📍 Safe Dates & Événements Babi** :
   - Catalogue de lieux publics partenaires vérifiés (Cocody, Zone 4, Assinie) avec invitation en 1 clic et billetterie payable par **GeniusPay**.
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

### Comptes démo pré-configurés
- **Kouamé (Cocody • Riviera)** : `kouame@akwaba.ci` / `Akwaba225!` (ou bouton **Explorer en tant que Kouamé** en 1 clic)
- **Aya (Cocody • Riviera)** : `aya@akwaba.ci` / `Akwaba225!` (ou bouton **Explorer en tant qu'Aya** en 1 clic)

---

## 🧪 Tests Automatisés

```bash
npm test
```

Couvre :
- Authentification JWT, inscription 18+ et système de parrainage
- Calcul réel d'alchimie culturelle *Vrai Babi* & filtrage par commune / Passeport Babi
- Swipes, matchs mutuels temps réel, rewind & révélation d'admirateurs
- Sentinelle *Bouclier Babi* anti-brouteurs & vérification Selfie 225
- Orchestration **GeniusPay** (création checkout, vérification cryptographique Webhook `HMAC-SHA256`, protection anti-replay, idempotence de livraison des Pass & Cauris)
