import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { getDb } from './database.js';

function createWarmPluckWav(filePath, notesHz) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sampleRate = 22050;
  const noteDuration = 0.65;
  const totalSamples = Math.floor(sampleRate * noteDuration * notesHz.length);
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i++) {
    const noteIndex = Math.min(notesHz.length - 1, Math.floor(i / (sampleRate * noteDuration)));
    const localT = (i % Math.floor(sampleRate * noteDuration)) / sampleRate;
    const freq = notesHz[noteIndex];
    const env = Math.exp(-localT * 4.2) * Math.min(1, localT * 45);
    const wave =
      Math.sin(2 * Math.PI * freq * localT) * 0.65 +
      Math.sin(2 * Math.PI * freq * 2 * localT) * 0.22;
    const sample = Math.max(-1, Math.min(1, wave * env * 0.35));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

export function ensureDemoAudioAssets() {
  const audioDir = path.join(config.rootDir, 'public/assets/audio');
  const melodies = {
    'aya-voice.wav': [261.63, 329.63, 392.0, 440.0, 523.25],
    'maimouna-voice.wav': [293.66, 349.23, 440.0, 523.25, 587.33],
    'grace-voice.wav': [246.94, 293.66, 369.99, 440.0, 493.88],
    'nadia-voice.wav': [261.63, 293.66, 392.0, 440.0, 523.25],
    'sarah-voice.wav': [220.0, 261.63, 329.63, 392.0, 440.0],
    'aminata-voice.wav': [293.66, 392.0, 440.0, 523.25, 659.25],
    'koffi-voice.wav': [196.0, 246.94, 293.66, 329.63, 392.0],
    'ibrahim-voice.wav': [174.61, 220.0, 261.63, 329.63, 349.23],
    'cedric-voice.wav': [220.0, 293.66, 329.66, 392.0, 440.0],
    'jeanmarc-voice.wav': [196.0, 261.63, 329.63, 392.0, 440.0],
  };

  for (const [filename, freqs] of Object.entries(melodies)) {
    const target = path.join(audioDir, filename);
    if (!fs.existsSync(target)) {
      createWarmPluckWav(target, freqs);
    }
  }
}

export function seedPartnerSpots(dbParam = null) {
  const db = dbParam || getDb();
  const existingSpots = db.prepare('SELECT COUNT(*) as cnt FROM safe_date_spots').get();
  if (existingSpots && Number(existingSpots.cnt) > 0) {
    return { spotsSeeded: false };
  }

  // Safe Date partner spots in Abidjan & Assinie
  const spots = [
    {
      id: 'spot_cocody_bistro',
      name: 'Kawa & Coco • Bistro Jardin',
      commune: 'Cocody • Ambassades',
      category: 'Café Chic & Brunch',
      vibe: 'Intime, lumineux et idéal pour une première conversation vraie',
      budget_xof: '6 000 – 14 000 FCFA / pers.',
      ticket_price_xof: 5000,
      image_url: '/assets/venues/cocody-bistro.jpg',
      perk_akwaba: '2 jus de bissap ou cafés ivoiriens offerts sur présentation du Pass AKWABA',
      next_event_title: 'Brunch Rencontres Célibataires Vérifiés 225',
      next_event_date: 'Dimanche • 11h30',
    },
    {
      id: 'spot_zone4_rooftop',
      name: 'La Lagune Sky Lounge',
      commune: 'Marcory • Zone 4',
      category: 'Rooftop Sunset',
      vibe: 'Vue panoramique sur la lagune Ébrié, musique afro-soul feutrée',
      budget_xof: '10 000 – 22 000 FCFA / pers.',
      ticket_price_xof: 8000,
      image_url: '/assets/venues/zone4-rooftop.jpg',
      perk_akwaba: 'Table réservée côté vue + accueil prioritaire Safe Date',
      next_event_title: 'Afterwork Diaspora & Abidjan Connect',
      next_event_date: 'Vendredi • 19h30',
    },
    {
      id: 'spot_assinie_sunset',
      name: 'Les Lanternes d’Assinie',
      commune: 'Assinie • Km 14',
      category: 'Évasion Lagune',
      vibe: 'Ponton en bois sur l’eau calme, lanternes dorées et brise marine',
      budget_xof: '15 000 – 30 000 FCFA / pers.',
      ticket_price_xof: 12000,
      image_url: '/assets/venues/assinie-sunset.jpg',
      perk_akwaba: 'Pass journée coucher de soleil + cocktail d’accueil',
      next_event_title: 'Sunset Acoustic & Rencontres Assinie',
      next_event_date: 'Samedi • 17h00',
    },
  ];

  const insertSpot = db.prepare(`
    INSERT INTO safe_date_spots (
      id, name, commune, category, vibe, budget_xof, ticket_price_xof,
      image_url, perk_akwaba, next_event_title, next_event_date
    ) VALUES (
      @id, @name, @commune, @category, @vibe, @budget_xof, @ticket_price_xof,
      @image_url, @perk_akwaba, @next_event_title, @next_event_date
    )
  `);

  for (const s of spots) {
    insertSpot.run(s);
  }
  return { spotsSeeded: true, spotsCount: spots.length };
}

export function seedDatabase(dbParam = null, options = {}) {
  const db = dbParam || getDb();
  const includeDemoUsers =
    options.includeDemoUsers !== undefined ? Boolean(options.includeDemoUsers) : Boolean(config.allowDemoLogin);

  const spotsRes = seedPartnerSpots(db);
  if (!includeDemoUsers) {
    return { seeded: false, ...spotsRes, usersCount: 0, demoSkipped: true };
  }

  ensureDemoAudioAssets();

  const existing = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (existing && Number(existing.cnt) > 0) {
    return { seeded: false, ...spotsRes };
  }

  const demoPasswordHash = bcrypt.hashSync('Akwaba225!', 10);

  const users = [
    {
      id: 'usr_kouame',
      email: 'kouame@akwaba.ci',
      phone: '+2250708112233',
      phone_verified: 1,
      name: 'Kouamé',
      age: 29,
      gender: 'man',
      looking_for: 'women',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Relation sérieuse',
      profession: 'Architecte Digital & Fintech',
      bio: 'Basé à la Riviera Golf. Passionné par les projets tech en Côte d’Ivoire, les brunchs du dimanche et les escapades à Grand-Bassam.',
      secret_prompt: 'Un coucher de soleil sur la lagune d’Assinie sans regarder nos téléphones.',
      avatar_url: '/assets/profiles/kouame.jpg',
      voice_note_url: '/assets/audio/koffi-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Architecture', 'Fintech', 'Grand-Bassam', 'Zouglou', 'Café']),
      vrai_babi_json: JSON.stringify({
        dish: 'Attiéké poisson braisé',
        music: 'Zouglou & ambiance',
        outing: 'Café / Brunch à Cocody',
        family_vision: 'Complices modernes & ambitieux',
        rhythm: 'Entrepreneur(e) toujours en mouvement',
      }),
      tonight_available: 1,
      tonight_mood: '☕ Café posé à Cocody Deux-Plateaux',
      verified_225: 1,
      trust_score: 95,
      cauris_balance: 350,
      subscription_tier: 'free',
      referral_code: 'AKW-KOUAME225',
      is_demo_bot: 0,
    },
    {
      id: 'usr_aya',
      email: 'aya@akwaba.ci',
      phone: '+2250749223344',
      phone_verified: 1,
      name: 'Aya',
      age: 26,
      gender: 'woman',
      looking_for: 'men',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Relation sérieuse',
      profession: 'Responsable Marketing Luxe',
      bio: 'Amoureuse des beaux rooftops de Cocody, de l’art contemporain abidjanais et des conversations vraies qui mènent quelque part.',
      secret_prompt: 'Tu gagnes des points immédiatement si tu connais les meilleures adresses d’attiéké braisé caché à Marcory.',
      avatar_url: '/assets/profiles/aya.jpg',
      voice_note_url: '/assets/audio/aya-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Art & Culture', 'Rooftops', 'Voyages', 'Zouglou', 'Grand-Bassam']),
      vrai_babi_json: JSON.stringify({
        dish: 'Attiéké poisson braisé',
        music: 'Zouglou & ambiance',
        outing: 'Café / Brunch à Cocody',
        family_vision: 'Complices modernes & ambitieux',
        rhythm: 'Équilibré & posé',
      }),
      tonight_available: 1,
      tonight_mood: '🥂 Verre en terrasse à Cocody Ambassades',
      verified_225: 1,
      trust_score: 98,
      cauris_balance: 200,
      subscription_tier: 'babi_gold',
      referral_code: 'AKW-AYA225',
      is_demo_bot: 1,
    },
    {
      id: 'usr_maimouna',
      email: 'maimouna@akwaba.ci',
      phone: '+2250554334455',
      phone_verified: 1,
      name: 'Maïmouna',
      age: 25,
      gender: 'woman',
      looking_for: 'men',
      commune: 'Marcory • Zone 4',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Sorties & Découverte',
      profession: 'Styliste & Créatrice de mode',
      bio: 'Entre mes collections de pagne revisité et mes soirées en Zone 4, je cherche quelqu’un de solaire, drôle et authentique.',
      secret_prompt: 'Un duel amical de danse coupé-décalé ou afrobeats après un bon dîner.',
      avatar_url: '/assets/profiles/maimouna.jpg',
      voice_note_url: '/assets/audio/maimouna-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Mode Ivoire', 'Zone 4', 'Afrobeats', 'Gastronomie', 'Plage']),
      vrai_babi_json: JSON.stringify({
        dish: 'Alloco & poulet',
        music: 'Afrobeats & Amapiano',
        outing: 'Sunset sur Rooftop Zone 4',
        family_vision: 'Découverte douce sans pression',
        rhythm: 'Oiseau de nuit & sorties',
      }),
      tonight_available: 1,
      tonight_mood: '🌆 Sunset & tapas sur un rooftop Zone 4',
      verified_225: 1,
      trust_score: 94,
      cauris_balance: 180,
      subscription_tier: 'free',
      referral_code: 'AKW-MAIMOUNA',
      is_demo_bot: 1,
    },
    {
      id: 'usr_nadia',
      email: 'nadia@akwaba.ci',
      phone: '+2250777889900',
      phone_verified: 1,
      name: 'Nadia',
      age: 28,
      gender: 'woman',
      looking_for: 'men',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Mariage & Valeurs',
      profession: 'Médecin Pédiatre',
      bio: 'Posée, famille importante, cœur tourné vers les autres. Je crois aux rencontres sincères sans jeux d’ego.',
      secret_prompt: 'Un dimanche matin tranquille, café ivoirien fraîchement moulu et projets d’avenir.',
      avatar_url: '/assets/profiles/nadia.jpg',
      voice_note_url: '/assets/audio/nadia-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Famille', 'Santé', 'Cuisine', 'Lecture', 'Zouglou']),
      vrai_babi_json: JSON.stringify({
        dish: 'Kedjenou maison',
        music: 'Zouglou & ambiance',
        outing: 'Café / Brunch à Cocody',
        family_vision: 'Tradition & valeurs familiales',
        rhythm: 'Équilibré & posé',
      }),
      tonight_available: 0,
      tonight_mood: '📚 Lecture & soirée calme après la garde',
      verified_225: 1,
      trust_score: 99,
      cauris_balance: 240,
      subscription_tier: 'free',
      referral_code: 'AKW-NADIA225',
      is_demo_bot: 1,
    },
    {
      id: 'usr_grace',
      email: 'grace@akwaba.ci',
      phone: '+2250141556677',
      phone_verified: 1,
      name: 'Grâce',
      age: 27,
      gender: 'woman',
      looking_for: 'men',
      commune: 'Grand-Bassam',
      city: 'Grand-Bassam',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Relation sérieuse',
      profession: 'Fondatrice Atelier Cacao',
      bio: 'Je transforme les fèves de cacao ivoiriennes en chocolat fin à Bassam. Passionnée d’océan, d’artisanat et de grands cœurs.',
      secret_prompt: 'Dégustation de cacao chaud au bord de la plage quand l’orage arrive.',
      avatar_url: '/assets/profiles/grace.jpg',
      voice_note_url: '/assets/audio/grace-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Cacao 225', 'Océan', 'Entrepreneuriat', 'Grand-Bassam', 'Jazz']),
      vrai_babi_json: JSON.stringify({
        dish: 'Attiéké poisson braisé',
        music: 'Soul, R&B & Jazz',
        outing: 'Plage à Assinie ou Bassam',
        family_vision: 'Complices modernes & ambitieux',
        rhythm: 'Entrepreneur(e) toujours en mouvement',
      }),
      tonight_available: 1,
      tonight_mood: '🌴 Balade plage au coucher du soleil à Bassam',
      verified_225: 1,
      trust_score: 96,
      cauris_balance: 300,
      subscription_tier: 'free',
      referral_code: 'AKW-GRACECI',
      is_demo_bot: 1,
    },
    {
      id: 'usr_sarah',
      email: 'sarah@akwaba.ci',
      phone: '+15145550199',
      phone_verified: 1,
      name: 'Sarah',
      age: 26,
      gender: 'woman',
      looking_for: 'men',
      commune: 'Montréal',
      city: 'Montréal',
      country_code: 'CA',
      is_diaspora: 1,
      passport_active: 1,
      passport_target_city: 'Abidjan',
      passport_arrival_date: '2026-12-18',
      passport_departure_date: '2027-01-06',
      intention: 'Connexion Diaspora-Pays',
      profession: 'Analyste Financière',
      bio: 'Ivoirienne à Montréal. J’atterris à Félix Houphouët-Boigny pour les fêtes et je veux reconnecter avec Abidjan autrement !',
      secret_prompt: 'Rien ne bat mon premier garba dès la sortie de l’aéroport de Port-Bouët.',
      avatar_url: '/assets/profiles/sarah.jpg',
      voice_note_url: '/assets/audio/sarah-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Diaspora Montréal', 'Fintech', 'Garba', 'Voyages', 'Assinie']),
      vrai_babi_json: JSON.stringify({
        dish: 'Garba bien pimenté',
        music: 'Afrobeats & Amapiano',
        outing: 'Plage à Assinie ou Bassam',
        family_vision: 'Construire un pont Diaspora-Pays',
        rhythm: 'Équilibré & posé',
      }),
      tonight_available: 1,
      tonight_mood: '✈️ Passeport Babi : arrivée à Abidjan le 18 Déc !',
      verified_225: 1,
      trust_score: 97,
      cauris_balance: 500,
      subscription_tier: 'diaspora_vip',
      referral_code: 'AKW-SARAHMTL',
      is_demo_bot: 1,
    },
    {
      id: 'usr_aminata',
      email: 'aminata@akwaba.ci',
      phone: '+2250788990011',
      phone_verified: 1,
      name: 'Aminata',
      age: 27,
      gender: 'woman',
      looking_for: 'everyone',
      commune: 'Cocody • Riviera',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Relation sérieuse',
      profession: 'Cheffe de Projet Énergie Solaire',
      bio: 'Curieuse, sportive, fan de spécialités ivoiriennes et de projets à impact. Cherche un complice sincère avec de l’humour.',
      secret_prompt: 'Je ris toujours aux blagues babi bien placées.',
      avatar_url: '/assets/profiles/aminata.jpg',
      voice_note_url: '/assets/audio/aminata-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Énergie Verte', 'Sport', 'Café', 'Cinéma', 'Humour']),
      vrai_babi_json: JSON.stringify({
        dish: 'Attiéké poisson braisé',
        music: 'Soul, R&B & Jazz',
        outing: 'Café / Brunch à Cocody',
        family_vision: 'Complices modernes & ambitieux',
        rhythm: 'Sport & bien-être',
      }),
      tonight_available: 1,
      tonight_mood: '☕ Café & refaire le monde à Cocody',
      verified_225: 1,
      trust_score: 92,
      cauris_balance: 260,
      subscription_tier: 'free',
      referral_code: 'AKW-AMINATA',
      is_demo_bot: 1,
    },
    {
      id: 'usr_koffi',
      email: 'koffi@akwaba.ci',
      phone: '+2250711223344',
      phone_verified: 1,
      name: 'Koffi',
      age: 30,
      gender: 'man',
      looking_for: 'women',
      commune: 'Plateau',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Mariage & Valeurs',
      profession: 'Avocat d’Affaires OHADA',
      bio: 'Basé au Plateau, j’aime les esprits vifs, les discussions autour d’un bon café et les week-ends calmes au bord de l’eau.',
      secret_prompt: 'Toujours partant pour un brunch surprise à Cocody.',
      avatar_url: '/assets/profiles/koffi.jpg',
      voice_note_url: '/assets/audio/koffi-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Droit OHADA', 'Café', 'Voyages', 'Jazz', 'Famille']),
      vrai_babi_json: JSON.stringify({
        dish: 'Kedjenou maison',
        music: 'Soul, R&B & Jazz',
        outing: 'Café / Brunch à Cocody',
        family_vision: 'Tradition & valeurs familiales',
        rhythm: 'Équilibré & posé',
      }),
      tonight_available: 1,
      tonight_mood: '🥂 Afterwork chic au Plateau',
      verified_225: 1,
      trust_score: 96,
      cauris_balance: 300,
      subscription_tier: 'babi_gold',
      referral_code: 'AKW-KOFFI225',
      is_demo_bot: 1,
    },
    {
      id: 'usr_ibrahim',
      email: 'ibrahim@akwaba.ci',
      phone: '+2250566778899',
      phone_verified: 1,
      name: 'Ibrahim',
      age: 28,
      gender: 'man',
      looking_for: 'women',
      commune: 'Marcory • Zone 4',
      city: 'Abidjan',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Sorties & Découverte',
      profession: 'Producteur Musical & Ingénieur Son',
      bio: 'Je façonne le son afrobeats d’Abidjan le jour et j’explore les meilleurs maquis de Marcory le soir.',
      secret_prompt: 'Je compose parfois une petite mélodie dédiée à celles qui me font sourire.',
      avatar_url: '/assets/profiles/ibrahim.jpg',
      voice_note_url: '/assets/audio/ibrahim-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Musique', 'Zone 4', 'Afrobeats', 'Maquis Chic', 'Studio']),
      vrai_babi_json: JSON.stringify({
        dish: 'Garba bien pimenté',
        music: 'Afrobeats & Amapiano',
        outing: 'Maquis chic & grillades',
        family_vision: 'Découverte douce sans pression',
        rhythm: 'Oiseau de nuit & sorties',
      }),
      tonight_available: 1,
      tonight_mood: '🎶 Session écoute & grillades à Marcory',
      verified_225: 1,
      trust_score: 91,
      cauris_balance: 210,
      subscription_tier: 'free',
      referral_code: 'AKW-IBRAHIM',
      is_demo_bot: 1,
    },
    {
      id: 'usr_cedric',
      email: 'cedric@akwaba.ci',
      phone: '+33612345678',
      phone_verified: 1,
      name: 'Cédric',
      age: 31,
      gender: 'man',
      looking_for: 'women',
      commune: 'Paris • Île-de-France',
      city: 'Paris',
      country_code: 'FR',
      is_diaspora: 1,
      passport_active: 1,
      passport_target_city: 'Abidjan',
      passport_arrival_date: '2026-12-20',
      passport_departure_date: '2027-01-08',
      intention: 'Connexion Diaspora-Pays',
      profession: 'Consultant Cloud & Tech',
      bio: 'Entre Paris et Abidjan, je prépare mon retour progressif au pays. À la recherche d’une femme ambitieuse, douce et complice.',
      secret_prompt: 'Rêve d’ouvrir un lieu convivial à Assinie dans quelques années.',
      avatar_url: '/assets/profiles/cedric.jpg',
      voice_note_url: '/assets/audio/cedric-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Diaspora Paris', 'Cloud Tech', 'Assinie', 'Voyages', 'Gastronomie']),
      vrai_babi_json: JSON.stringify({
        dish: 'Alloco & poulet',
        music: 'Coupé-Décalé chic',
        outing: 'Sunset sur Rooftop Zone 4',
        family_vision: 'Construire un pont Diaspora-Pays',
        rhythm: 'Entrepreneur(e) toujours en mouvement',
      }),
      tonight_available: 1,
      tonight_mood: '✈️ Bientôt à Babi — ouvert aux belles rencontres',
      verified_225: 1,
      trust_score: 95,
      cauris_balance: 400,
      subscription_tier: 'diaspora_vip',
      referral_code: 'AKW-CEDRICPAR',
      is_demo_bot: 1,
    },
    {
      id: 'usr_jeanmarc',
      email: 'jeanmarc@akwaba.ci',
      phone: '+2250799001122',
      phone_verified: 1,
      name: 'Jean-Marc',
      age: 33,
      gender: 'man',
      looking_for: 'women',
      commune: 'Yamoussoukro',
      city: 'Yamoussoukro',
      country_code: 'CI',
      is_diaspora: 0,
      passport_active: 0,
      passport_target_city: '',
      intention: 'Mariage & Valeurs',
      profession: 'Ingénieur Agronome & Exportateur',
      bio: 'Partagé entre Yamoussoukro et Abidjan. Homme de parole, calme et attentionné, prêt pour une belle histoire durable.',
      secret_prompt: 'Grand amateur de balades matinales au bord des lacs de Yakro.',
      avatar_url: '/assets/profiles/jeanmarc.jpg',
      voice_note_url: '/assets/audio/jeanmarc-voice.wav',
      voice_duration_sec: 4,
      tags_json: JSON.stringify(['Agro-tech', 'Yamoussoukro', 'Famille', 'Nature', 'Zouglou']),
      vrai_babi_json: JSON.stringify({
        dish: 'Kedjenou maison',
        music: 'Zouglou & ambiance',
        outing: 'Plage à Assinie ou Bassam',
        family_vision: 'Tradition & valeurs familiales',
        rhythm: 'Sport & bien-être',
      }),
      tonight_available: 1,
      tonight_mood: '🌅 Détente à Yakro ce soir, à Abidjan ce week-end',
      verified_225: 1,
      trust_score: 94,
      cauris_balance: 280,
      subscription_tier: 'free',
      referral_code: 'AKW-JMYAKRO',
      is_demo_bot: 1,
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (
      id, email, phone, phone_verified, password_hash, name, age, gender, looking_for,
      commune, city, country_code, is_diaspora, passport_active, passport_target_city,
      passport_arrival_date, passport_departure_date, intention, profession, bio, secret_prompt,
      avatar_url, voice_note_url, voice_duration_sec, tags_json, vrai_babi_json,
      tonight_available, tonight_mood, incognito, verified_225, trust_score, cauris_balance,
      subscription_tier, referral_code, is_demo_bot
    ) VALUES (
      @id, @email, @phone, @phone_verified, @password_hash, @name, @age, @gender, @looking_for,
      @commune, @city, @country_code, @is_diaspora, @passport_active, @passport_target_city,
      @passport_arrival_date, @passport_departure_date, @intention, @profession, @bio, @secret_prompt,
      @avatar_url, @voice_note_url, @voice_duration_sec, @tags_json, @vrai_babi_json,
      @tonight_available, @tonight_mood, 0, @verified_225, @trust_score, @cauris_balance,
      @subscription_tier, @referral_code, @is_demo_bot
    )
  `);

  for (const u of users) {
    insertUser.run({
      ...u,
      password_hash: demoPasswordHash,
      passport_arrival_date: u.passport_arrival_date || '',
      passport_departure_date: u.passport_departure_date || '',
    });
  }

  // Initial mutual matches for Kouamé so Chat & Matchs work immediately on launch
  db.prepare(
    `INSERT INTO matches (id, user_a, user_b, compatibility_score, is_super_match)
     VALUES (?, ?, ?, ?, ?)`
  ).run('match_kouame_aya', 'usr_kouame', 'usr_aya', 94, 1);

  db.prepare(
    `INSERT INTO matches (id, user_a, user_b, compatibility_score, is_super_match)
     VALUES (?, ?, ?, ?, ?)`
  ).run('match_kouame_grace', 'usr_kouame', 'usr_grace', 89, 0);

  // Incoming likes so Kouamé sees admirers waiting in "Admirateurs"
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_aya', 'usr_kouame', 'super_like');
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_kouame', 'usr_aya', 'like');
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_grace', 'usr_kouame', 'like');
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_kouame', 'usr_grace', 'like');
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_nadia', 'usr_kouame', 'super_like');
  db.prepare(`INSERT INTO swipes (actor_id, target_id, action) VALUES (?, ?, ?)`).run('usr_sarah', 'usr_kouame', 'like');

  // Initial messages in Salon Privé
  db.prepare(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content)
     VALUES (?, ?, ?, ?, 'text', ?)`
  ).run(
    'msg_seed_1',
    'match_kouame_aya',
    'usr_aya',
    'usr_kouame',
    'Akwaba Kouamé ! J’ai vu qu’on était tous les deux Team Attiéké poisson & Zouglou à Cocody. Tu connais un bon spot calme pour un café cette semaine ?'
  );

  db.prepare(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content, media_url, metadata_json)
     VALUES (?, ?, ?, ?, 'voice', ?, ?, ?)`
  ).run(
    'msg_seed_2',
    'match_kouame_aya',
    'usr_aya',
    'usr_kouame',
    'Note vocale d’Aya (0:04)',
    '/assets/audio/aya-voice.wav',
    JSON.stringify({ durationSec: 4 })
  );

  db.prepare(
    `INSERT INTO messages (id, match_id, sender_id, recipient_id, msg_type, content)
     VALUES (?, ?, ?, ?, 'text', ?)`
  ).run(
    'msg_seed_3',
    'match_kouame_grace',
    'usr_grace',
    'usr_kouame',
    'Salut Kouamé ! Si tu descends sur Grand-Bassam ce week-end, passe goûter nos chocolats au cacao ivoirien.'
  );

  // Initial wallet transaction for Kouamé
  db.prepare(
    `INSERT INTO wallet_transactions (id, user_id, tx_type, amount_cauris, reason, reference)
     VALUES (?, ?, 'credit', ?, ?, ?)`
  ).run('tx_seed_welcome', 'usr_kouame', 350, 'Bonus de bienvenue AKWABA + Profil Vérifié 225', 'WELCOME-225');

  return { seeded: true, usersCount: users.length };
}

// Allow running directly via `npm run seed`
const isDirectSeed = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectSeed) {
  const res = seedDatabase();
  console.log('AKWABA seed result:', res);
}
