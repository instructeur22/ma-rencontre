# 🇨🇮 AKWABA — Synthèse Marché, Tendances, Monétisation & Plan Détaillé par Modules

> **Vision produit** : Concevoir et implanter **AKWABA**, une application web progressive (PWA) **API-first** pensée dès le premier jour pour être partagée avec de futures applications mobiles **Flutter (iOS & Android)**, dédiée aux rencontres authentiques en Côte d'Ivoire et au sein de sa diaspora.

---

## 1. Vérification de l'Existant

### 1.1 Audit du dépôt initial (`ma-rencontre`)
Lors de l'inspection initiale du dépôt, l'existant se limitait à un prototype statique front-end nommé `ARDENT.club` :
- **Stack** : 3 fichiers statiques (`index.html`, `styles.css`, `app.js`) sans serveur ni base de données.
- **Limitations structurelles** :
  - Aucune API REST ni WebSocket : inutilisable comme socle pour une future application Flutter iOS/Android.
  - Données codées en dur (`PROFILES` situés à Paris, Lyon, Marseille, Bordeaux, Nice) avec URL externes Unsplash et persistance limitée à `localStorage`.
  - Absence d'authentification, de calcul réel de compatibilité, de gestion audio/vocale, de vérification anti-faux profils et de module de paiement.

### 1.2 Benchmark des applications de rencontre en Côte d'Ivoire (2025–2026)

| Application | Positionnement | Forces | Faiblesses sur le marché ivoirien |
| :--- | :--- | :--- | :--- |
| **Tinder / Bumble / Badoo** | Généralistes mondiaux | Forte notoriété à Abidjan (Cocody, Zone 4), UX fluide, vérification photo | Tarifs en EUR/USD peu adaptés au FCFA ; absence de paiement fluide Wave/OM natif ; pas de filtrage par communes d'Abidjan ; forte présence de faux profils. |
| **Chat&Yamo** | Afrique & Diaspora (4M+ inscrits) | Intentions affichées, vidéo dating, certification photo/vidéo, Mobile Money | Modèle centré sur des abonnements récurrents parfois perçus comme rigides ; approche swipe classique peu différenciante culturellement. |
| **Heyama** | 100 % Africain sans abonnement | Modèle à l'acte par pièces, blocage captures, filtrage de numéros dans les premiers DM, Mobile Money (Wave, MTN, Orange, Moov) | Absence d'expérience voix/audio centrale sur le profil ; pas d'ancrage hyper-local par quartiers/communes ivoiriennes ni de billetterie Safe Date IRL. |
| **Afrosmeet CI** | Afrique & Diaspora (fort ancrage CI) | Afro Passport avant d'atterrir à Port-Bouët, Stories, vérification photo-geste anti-brouteurs | Obligation pour au moins un des deux membres d'être Premium **même après un match** pour discuter (forte friction). |
| **Sites d'annonces / Groupes** | Petites annonces web | Gratuité totale | UX obsolète, numéros WhatsApp exposés sans consentement, taux élevé d'arnaques. |

---

## 2. Tendances Actuelles du Dating (2025–2026) & Spécificités Ivoiriennes

1. **Fin de la fatigue du swipe aveugle & Intentions explicites** : Les utilisateurs (notamment la Gen Z et les jeunes actifs d'Abidjan) privilégient la clarté dès l'inscription (*Mariage & Valeurs*, *Relation sérieuse*, *Sorties & Découverte*, *Connexion Diaspora-Pays*) et des matchs expliqués plutôt qu'un défilement infini.
2. **L'Audio & les Notes Vocales ("Voice Prompts")** : Selon les rapports sectoriels (Hinge, Bumble), les profils avec extrait vocal convertissent jusqu'à **+32 %** de discussions en rencontres réelles. En Côte d'Ivoire, la note vocale est déjà le canal de confiance naturel (avant même le texte).
3. **Confiance par défaut (Anti-Catfish & Anti-Brouteurs)** : Le principal frein à l'adoption et à la conversion payante en Côte d'Ivoire est la peur des faux profils et des sollicitations financières. La vérification par **défi selfie gestuel**, le **score de confiance dynamique** et une **sentinelle anti-arnaque** dans la messagerie sont indispensables.
4. **Mobilité urbaine abidjanaise & Pont avec la Diaspora** : À Abidjan, la distance brute à vol d'oiseau trompe (traverser un pont entre Yopougon, Cocody et Marcory aux heures de pointe change tout). Le filtrage par **Commune / Quartier** + le mode **« Passeport Babi / Retour au Pays »** (indiquer ses dates de venue à Abidjan) répondent à un besoin réel.
5. **Du virtuel au réel en sécurité (« Safe Dates »)** : Proposer des lieux publics vérifiés (bistros de Cocody, rooftops de Zone 4, plages d'Assinie/Grand-Bassam) facilite le premier rendez-vous et rassure particulièrement les utilisatrices.
6. **Micro-paiements Mobile Money (FCFA) vs Abonnements rigides** : Le marché africain du Mobile Money (Wave, Orange Money, MTN MoMo, Moov Money) favorise des **pass courts accessibles (1 000 FCFA / 3 jours)** et des **micro-crédits sans engagement (dès 500 FCFA)**.

---

## 3. Synthèse : Concept Innovant « AKWABA »

**AKWABA** repose sur 6 piliers innovants intégrés de bout en bout :

1. **Le Bouclier Babi** : Défi selfie gestuel avec attribution du badge *Vérifié 225*, score de confiance transparent (0–100), sentinelle anti-sollicitation financière en temps réel dans le chat, et blocage/signalement instantané.
2. **La Voix d'Abidjan** : Enregistreur et lecteur de notes vocales directement sur la fiche profil (présentation de 30s) et dans le Salon Privé.
3. **Alchimie Culturelle « Vrai Babi »** : Algorithme de compatibilité réel (0–100 %) combinant intentions, 5 questions culturelles ivoiriennes (*Plat du dimanche*, *Ambiance musicale*, *Sortie idéale*, *Vision du couple*, *Rythme de vie*), centres d'intérêt et zone géographique, avec explication claire des points communs.
4. **Géolocalisation par Communes & Passeport Babi** : Sélection multi-zones (Cocody/Riviera, Plateau, Marcory/Zone 4, Yopougon, Koumassi, Treichville, Bingerville, Grand-Bassam, Assinie, Bouaké, Yamoussoukro, San-Pédro, Korhogo + Diaspora Paris, Lyon, Bruxelles, Montréal, Londres) et annonce des dates de séjour à Abidjan.
5. **Sorties « Safe Dates » & Radar Ce Soir** : Publication du mood du soir + catalogue de lieux partenaires vérifiés à Abidjan et Assinie avec invitation directe en un clic dans le chat et réservation de créneau/événement.
6. **Économie Hybride Cauris + Pass Flex propulsée par GeniusPay** : Discussion 100 % gratuite après match mutuel (zéro frustration), monétisation fluide par Pass courts/mensuels, Cauris à l'acte, cadeaux culturels ivoiriens et billetterie Safe Date.

---

## 4. Plan Détaillé par Modules et Fonctions

L'architecture est **API-First** (`/api/v1/*` + WebSocket `/ws`) : la Web App actuelle et les futures applications mobiles **Flutter (iOS & Android)** partagent exactement le même backend, la même logique métier et les mêmes webhooks.

### Module 1 — Authentification, Session & Onboarding 225 (`routes/auth.js`)
- `registerUser()` : Inscription par email/téléphone, validation majorité (18+), attribution du bonus de bienvenue (**50 Cauris**), génération du code de parrainage unique (`AKW-XXXXXX`) et crédit éventuel du parrain (+100 Cauris).
- `loginUser()` : Connexion sécurisée avec hachage `bcrypt` et délivrance d'un JWT signé (`Bearer token`) compatible Web et Flutter (`flutter_secure_storage`).
- `demoQuickSwitch()` : Accès instantané à un compte de démonstration pré-peuplé pour tester l'application sans friction.
- `verifyPhoneOtp()` : Validation du numéro ivoirien (`+225`) ou diaspora pour augmenter le score de confiance (+20 pts).
- `getCurrentSession()` : Récupération du profil complet, statut d'abonnement actif, solde de Cauris et statistiques de sécurité.

### Module 2 — Profils, Voix d'Abidjan & Passeport Babi (`routes/profiles.js`)
- `getMyProfile()` / `updateMyProfile()` : Édition complète (prénom, âge, commune/ville, intention, bio, phrase d'accroche secrète, tags, réponses au quiz *Vrai Babi*, mood du soir).
- `uploadVoiceBio()` : Enregistrement audio WebM/WAV (max 30s) stocké côté serveur et exposé sur la carte profil (+15 pts au score de confiance).
- `activatePassportBabi()` : Activation de la ville cible et des dates d'arrivée à Abidjan / Côte d'Ivoire pour la diaspora (inclus dans Pass Diaspora VIP ou déblocable en Cauris).
- `toggleIncognitoMode()` : Masquage du profil dans le deck public (visible uniquement par les personnes likées ou contactées).
- `activateVisibilityBoost()` : Mise en tête de pile pendant 24 heures (*Tête d'affiche Abidjan*, coût : 150 Cauris ou inclus Gold/VIP).

### Module 3 — Découverte & Algorithme d'Alchimie (`services/matchingService.js`, `routes/profiles.js`)
- `computeCompatibilityScore(viewer, candidate)` : Calcul pondéré sur 100 points :
  - Alignement d'intention (30 pts)
  - Affinités culturelles *Vrai Babi* (40 pts)
  - Intérêts & tags partagés (20 pts)
  - Proximité géographique / même commune ou diaspora compatible (10 pts)
- `buildMatchReasons()` : Génération d'explications lisibles (ex. *« Même intention Mariage • Fans de Zouglou • Tous deux à Cocody »*).
- `discoverProfiles(filters)` : Filtrage multicritères (commune/ville, diaspora, intention, vérifiés uniquement, disponibles ce soir, distance/zone), exclusion des profils déjà bloqués/swipes, tri combinant score d'alchimie, boost actif et fraîcheur d'activité.

### Module 4 — Interactions, Matchs & Admirateurs (`routes/matching.js`)
- `recordSwipe(targetId, action)` : Enregistrement `pass`, `like` ou `super_like` (Coup de Cœur) avec contrôle des quotas gratuits quotidiens et détection automatique de match réciproque.
- `rewindLastPass()` : Retour arrière sur le dernier profil passé (gratuit avec Pass ou 60 Cauris).
- `listMatches()` : Liste des matchs mutuels avec dernier message, score d'alchimie et statut en ligne.
- `listReceivedLikes()` / `revealAdmirer(userId)` : Liste des admirateurs (floutés si utilisateur gratuit sauf Pass Gold/VIP, ou révélables à l'unité contre 120 Cauris).

### Module 5 — Salon Privé Temps Réel, Vocaux, Brise-Glaces & Cadeaux (`routes/chat.js`, `ws/realtime.js`)
- `getConversationHistory(matchId)` : Chargement paginé des messages texte, vocaux, cadeaux et invitations Safe Date.
- `sendTextMessage(matchId, content)` : Envoi temps réel via REST + diffusion WebSocket instantanée, avec analyse préalable par le *Bouclier Babi*.
- `sendDirectMessageBeforeMatch(targetId, content)` : Envoi d'un premier message personnalisé avant match (100 Cauris ou quota Pass) — **la réponse du destinataire reste toujours gratuite**.
- `sendVoiceNote(matchId, audioData)` : Envoi de note vocale dans la discussion.
- `sendCulturalGift(matchId, giftCode)` : Envoi d'un cadeau virtuel ivoirien (*Rose d'Abidjan*, *Jus de Bissap Frais*, *Cacao Grand Cru*, *Escapade Assinie*) débité en Cauris et notifié en temps réel.
- `sendDateInvite(matchId, spotId, proposedDate)` : Proposition structurée d'un rendez-vous dans un lieu partenaire *Safe Date*.
- `broadcastRealtimeEvent()` : Canal WebSocket authentifié par token JWT pour messages, matchs, cadeaux et confirmations de paiement.

### Module 6 — Bouclier Babi : Vérification & Anti-Brouteurs (`services/antiScamService.js`, `routes/safety.js`)
- `generateSelfieChallenge()` : Génération d'un défi gestuel aléatoire (ex. *« Doigts en V près du menton »*, *« Main ouverte à côté du visage »*).
- `submitSelfieVerification(challengeId, imagePayload)` : Enregistrement de la preuve de vérification, attribution du badge **Vérifié 225** et recalcul du score de confiance.
- `computeTrustScore(user)` : Calcul dynamique sur 100 (Email/Tél vérifié, Selfie 225, Bio vocale, Complétude profil, Ancienneté, Absence de signalement).
- `inspectMessageForScamSignals(text)` : Détection heuristique des marqueurs d'arnaque romantique / sollicitation financière précoce (*demande de transfert, Wave/OM urgent, Western Union, carte prépayée, partage de numéro externe avant confiance*) → déclenchement d'une alerte pédagogique de vigilance ou blocage selon gravité.
- `blockAndReportUser(targetId, reason)` : Rupture immédiate du match, masquage mutuel et création d'un ticket de modération.

### Module 7 — Portefeuille Cauris & Boutique (`services/monetizationService.js`, `routes/payments.js`)
- `getStoreCatalog()` : Catalogue complet des Pass Flex/VIP, Packs de Cauris, Cadeaux Culturels et Options à l'acte en XOF (FCFA).
- `getWalletSummary()` : Solde de Cauris, historique complet des transactions (gains, dépenses, achats), abonnement actif et date d'expiration.
- `claimDailyCheckin()` : Série quotidienne de connexion offrant des Cauris gratuits (+15 à +40 Cauris selon les jours consécutifs).
- `spendCauris(userId, amount, reason)` : Débit atomique SQLite avec vérification de solde et journalisation immuable.

### Module 8 — Orchestration Paiements GeniusPay (`services/geniusPayService.js`, `routes/payments.js`)
- `initiateCheckout(userId, itemCode, paymentMethod, customerPhone)` :
  - Création d'une commande locale `pending` avec référence unique et `metadata` (`order_id`, `user_id`, `item_code`).
  - Appel à `POST https://pay.genius.ci/api/v1/merchant/payments` avec `X-API-Key` & `X-API-Secret` (ou bascule automatique vers le **Simulateur Sandbox GeniusPay fidèle** si les clés marchandes ne sont pas encore renseignées dans `.env`).
  - Retourne `checkout_url` (ou `payment_url` direct Wave/OM/MTN/Moov/Carte), détail transparent des frais XOF, et référence `MTX-...`.
- `handleGeniusPayWebhook(headers, rawPayload)` :
  - Vérification cryptographique `HMAC-SHA256(timestamp + "." + jsonPayload, GENIUSPAY_WEBHOOK_SECRET)` avec comparaison à temps constant (`crypto.timingSafeEqual`) et fenêtre anti-replay de 300 secondes.
  - Traitement idempotent de `payment.success` (activation immédiate du Pass ou crédit des Cauris + notification WebSocket temps réel) et `payment.failed` / `payment.cancelled`.
- `verifyTransactionStatus(reference)` : Interrogation de `GET /api/v1/merchant/payments/{reference}` pour réconciliation manuelle ou mobile.

### Module 9 — Safe Dates & Événements Babi (`routes/dates.js`)
- `listSafeDateSpots(commune)` : Annuaire de lieux publics vérifiés à Abidjan & Assinie (*Cocody Bistrot*, *Rooftop Zone 4*, *Lagune d'Assinie*, *Café du Plateau*) avec fourchette de budget, ambiance, avantages membres AKWABA et créneaux d'événements célibataires.
- `bookSafeDateOrEvent(spotId, dateStr, ticketCount)` : Réservation directe ou achat de billet événementiel (payable par GeniusPay même sur app mobile !).

---

## 5. Moyens de Gagner de l'Argent & Arbitrage Paiements (GeniusPay vs Stores Mobiles)

### 5.1 Sources de revenus adaptées au marché ivoirien (FCFA / XOF)

| Flux de revenus | Offre & Prix indicatif (XOF) | Pourquoi ça convertit en Côte d'Ivoire |
| :--- | :--- | :--- |
| **1. Pass Flex sans engagement long** | **Pass Djô 3 Jours : 1 000 FCFA**<br>**Pass Babi Gold 1 Mois : 3 500 FCFA**<br>**Pass Diaspora VIP 1 Mois : 9 500 FCFA** | Ticket d'entrée accessible (1 000 FCFA pour le week-end), adapté au pouvoir d'achat local vs 20 000 FCFA sur Tinder. |
| **2. Micro-achats à l'acte (Cauris)** | **250 Cauris : 500 FCFA**<br>**850 Cauris : 1 500 FCFA**<br>**3 200 Cauris : 5 000 FCFA** | Modèle plébiscité par les utilisateurs Mobile Money qui refusent les prélèvements automatiques mensuels. |
| **3. Cadeaux Culturels & Super DM** | DM avant match (100 Cauris), Boost 24h (150 Cauris), Révéler Admirateur (120 Cauris), Cadeaux 50–400 Cauris | Valorise l'effort sincère tout en gardant la réponse gratuite pour éviter les conversations mortes. |
| **4. Billetterie Soirées & Partenariats B2B « Safe Dates »** | **Pass Afterwork / Brunch Célibataires : 5 000 – 10 000 FCFA**, commission apporteur d'affaires restaurants/lounges (10–15 %) | Génère du revenu hors-abonnement sur des expériences réelles à Abidjan et Assinie. |

### 5.2 Arbitrage Technique & Réglementaire : GeniusPay Direct vs Apple App Store / Google Play

> **Question posée** : *« Si c'est possible directement dans l'application, on utilisera GeniusPay pour gérer les paiements, sinon, à arbitrer. »*

1. **Sur l'Application Web / PWA (actuelle)** :
   - ✅ **100 % GeniusPay directement dans l'application !**
   - Aucune restriction de store : les utilisateurs paient directement par **Wave**, **Orange Money**, **MTN MoMo**, **Moov Money** ou **Carte Visa/Mastercard** via l'API `https://pay.genius.ci/api/v1/merchant/payments`.
   - Frais GeniusPay très compétitifs : à partir de **2,5 % + 100 XOF** sur Wave (1,5 % opérateur + 1 % + 100 XOF GeniusPay) contre 15 % à 30 % prélevés par Apple/Google.

2. **Sur les futures Apps Mobiles Flutter (iOS App Store & Android Google Play)** :
   - ⚠️ **Règle impérative des Stores (Apple Guideline 3.1.1 & Google Play Payments Policy)** :
     - Pour les **biens numériques consommés dans l'app** (Pass Gold/VIP, Cauris, Boosts, Cadeaux virtuels), Apple et Google **interdisent** de déclencher un paiement externe (GeniusPay/Wave) dans les binaires distribués sur leurs stores hors zones exemptées (UE/US/Corée/Japon). Intégrer `geniuspay_flutter` pour acheter des Cauris sur l'App Store CI exposerait l'app à un rejet en review.
   - ⚖️ **Arbitrage recommandé (Architecture Hybride implémentée dès maintenant)** :
     1. **Canal Web / PWA (ou APK Android direct hors Play Store)** → Paiement **100 % GeniusPay** (Wave, OM, MTN, Moov, Carte).
     2. **Canal App Store iOS & Google Play (Biens numériques)** → **Apple In-App Purchase / Google Play Billing** dans Flutter (`in_app_purchase` / RevenueCat) synchronisés sur le **même portefeuille serveur** (`wallet_transactions` / `subscriptions`) + possibilité pour l'utilisateur de gérer/recharger son compte sur le portail web `akwaba.ci` via GeniusPay (les droits achetés sur le Web sont immédiatement utilisables dans l'app Flutter).
     3. **Canal Flutter iOS & Android (Services réels & Billetterie IRL « Safe Dates »)** → **100 % `geniuspay_flutter` directement dans l'app mobile !** Apple et Google autorisent explicitement les prestataires externes (Wave, Orange Money via GeniusPay) pour la réservation de tables, soirées physiques et expériences réelles hors-application.

Notre backend intègre déjà cette **couche d'abstraction multi-fournisseurs (`provider: 'geniuspay' | 'apple_iap' | 'google_play'`)** et une intégration complète de **GeniusPay** (Checkout, Direct Mobile Money, Webhooks signés HMAC-SHA256, et Sandbox local interactif).
