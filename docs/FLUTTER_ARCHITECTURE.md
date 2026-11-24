# 📱 Architecture Flutter (iOS & Android) — AKWABA

Cette application Web a été construite selon une architecture **API-First** (`/api/v1/*` + WebSocket `/ws`) afin de permettre un portage rapide vers **Flutter iOS & Android** sans réécrire la logique métier.

## 1. Stack Flutter Recommandée (`pubspec.yaml`)

```yaml
dependencies:
  flutter:
    sdk: flutter
  dio: ^5.7.0                   # Client REST avec intercepteur JWT Bearer
  flutter_riverpod: ^2.6.1      # Gestion d'état réactive par modules
  go_router: ^14.6.0            # Navigation (Découvrir, Safe Dates, Matchs, Salon, Boutique, Profil)
  web_socket_channel: ^3.0.1    # Connexion temps réel /ws?token=<JWT>
  flutter_secure_storage: ^9.2.2 # Stockage sécurisé du JWT
  just_audio: ^0.9.42           # Lecture des notes vocales profil & chat
  record: ^5.2.0                # Enregistrement micro 30s (La Voix d'Abidjan)
  image_picker: ^1.1.2          # Capture selfie gestuel Bouclier Babi
  geniuspay_flutter: ^1.0.0     # SDK officiel GeniusPay (Wave, Orange Money, MTN, Moov, Carte)
  in_app_purchase: ^3.2.0       # Apple IAP / Google Play Billing pour biens numériques Stores
```

## 2. Structure Modulaire Flutter (Miroir du Web)

```text
lib/
├── core/
│   ├── network/akwaba_api_client.dart   # Base URL + Intercepteur Authorization: Bearer <jwt>
│   ├── network/realtime_socket.dart     # Reconnexion automatique sur /ws
│   └── theme/akwaba_theme.dart          # Palette Ivoire (#FAF6F0), Terracotta (#C84B24), Lagune (#1A6B54)
├── features/
│   ├── auth/                            # /auth/register, /auth/login, /auth/me
│   ├── discover/                        # /profiles/discover, /swipes, /swipes/rewind
│   ├── voice/                           # Enregistrement & lecture audio (/profiles/me/voice)
│   ├── safety/                          # Bouclier Babi (/safety/challenge, /safety/verify-selfie)
│   ├── chat/                            # /matches, /chats/{id}/messages, /gift, /date-invite
│   ├── dates/                           # Safe Dates & Billetterie (/dates/spots, /dates/bookings)
│   └── payments/                        # Orchestration hybride GeniusPay + Store IAP
```

## 3. Arbitrage Paiements sur Flutter (Règle Stores vs GeniusPay)

1. **Biens Numériques consommés dans l'app** (Pass Djô, Pass Babi Gold, Pass Diaspora VIP, Packs Cauris) :
   - Sur **App Store (iOS)** et **Google Play (Android)** hors UE/US/Corée/Japon : utiliser `in_app_purchase` (ou RevenueCat) pour la validation Store, puis envoyer le reçu à notre endpoint serveur pour créditer le **même portefeuille Cauris**.
   - En parallèle, les utilisateurs ayant rechargé sur **le portail Web (`akwaba.ci`) via GeniusPay (Wave / Orange Money / MTN MoMo)** retrouvent instantanément leurs Cauris et Pass actifs dans l'app Flutter !
   - Pour une **distribution APK Android directe** en Côte d'Ivoire (hors Play Store), `geniuspay_flutter` est utilisable directement pour tous les produits.
2. **Services Physiques & Billetterie IRL (« Safe Dates » & Soirées à Abidjan)** :
   - Autorisés par Apple & Google via processeur externe : utilisez **`geniuspay_flutter` directement dans l'app iOS et Android** avec Wave, Orange Money, MTN MoMo, Moov Money et Carte bancaire (`POST /api/v1/dates/bookings`).

## 4. Exemple d'appel `geniuspay_flutter` pour les Safe Dates

```dart
final checkout = await apiClient.post('/dates/bookings', data: {
  'spotId': 'spot_cocody_bistro',
  'guestsCount': 2,
  'paymentMethod': 'wave',
  'customerPhone': '+2250708112233',
});

final result = await GeniusPay.instance.openPaymentPage(checkout['checkoutUrl']);
// La confirmation réelle arrive côté serveur via POST /api/v1/webhooks/geniuspay
// et notifie l'app Flutter en temps réel via WebSocket (`payment_completed`) !
```
