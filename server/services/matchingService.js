export const ABIDJAN_COMMUNES = [
  'Cocody • Riviera',
  'Marcory • Zone 4',
  'Plateau',
  'Yopougon',
  'Bingerville',
  'Koumassi',
  'Treichville',
  'Port-Bouët',
  'Abobo',
];

export const CI_CITIES = [
  'Abidjan',
  'Grand-Bassam',
  'Assinie',
  'Yamoussoukro',
  'Bouaké',
  'San-Pédro',
  'Korhogo',
  'Daloa',
];

export const DIASPORA_HUBS = [
  'Paris • Île-de-France',
  'Lyon',
  'Bruxelles',
  'Montréal',
  'Londres',
  'Genève',
  'Washington DC',
];

export const VRAI_BABI_QUESTIONS = [
  {
    key: 'dish',
    label: 'Ton incontournable du dimanche à Abidjan ?',
    options: ['Attiéké poisson braisé', 'Garba bien pimenté', 'Alloco & poulet', 'Kedjenou maison'],
  },
  {
    key: 'music',
    label: 'Ta bande-son idéale en voiture sur le pont HKB ?',
    options: ['Zouglou & ambiance', 'Afrobeats & Amapiano', 'Coupé-Décalé chic', 'Soul, R&B & Jazz'],
  },
  {
    key: 'outing',
    label: 'Premier rendez-vous parfait selon toi ?',
    options: ['Café / Brunch à Cocody', 'Sunset sur Rooftop Zone 4', 'Plage à Assinie ou Bassam', 'Maquis chic & grillades'],
  },
  {
    key: 'family_vision',
    label: 'Ta vision du couple ?',
    options: ['Tradition & valeurs familiales', 'Complices modernes & ambitieux', 'Découverte douce sans pression', 'Construire un pont Diaspora-Pays'],
  },
  {
    key: 'rhythm',
    label: 'Ton rythme de vie ?',
    options: ['Équilibré & posé', 'Oiseau de nuit & sorties', 'Entrepreneur(e) toujours en mouvement', 'Sport & bien-être'],
  },
];

export function parseJsonSafe(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

export function computeCompatibility(viewer, candidate) {
  let score = 18; // base baseline
  const reasons = [];

  // 1. Intention alignment (up to 30 pts)
  if (viewer.intention && candidate.intention) {
    if (viewer.intention === candidate.intention) {
      score += 30;
      reasons.push(`Même intention : ${candidate.intention}`);
    } else if (
      (viewer.intention.includes('Mariage') && candidate.intention.includes('sérieuse')) ||
      (candidate.intention.includes('Mariage') && viewer.intention.includes('sérieuse'))
    ) {
      score += 22;
      reasons.push('Objectifs relationnels sérieux alignés');
    } else if (
      viewer.intention.includes('Diaspora') ||
      candidate.intention.includes('Diaspora')
    ) {
      score += 18;
      reasons.push('Ouverture Diaspora ↔ Côte d’Ivoire');
    } else {
      score += 10;
    }
  }

  // 2. Vrai Babi cultural quiz (up to 32 pts)
  const viewerQuiz = parseJsonSafe(viewer.vrai_babi_json, {});
  const candQuiz = parseJsonSafe(candidate.vrai_babi_json, {});
  let quizMatches = 0;
  for (const q of VRAI_BABI_QUESTIONS) {
    if (viewerQuiz[q.key] && candQuiz[q.key] && viewerQuiz[q.key] === candQuiz[q.key]) {
      quizMatches += 1;
      if (q.key === 'music') reasons.push(`Même vibe musicale (${candQuiz[q.key]})`);
      if (q.key === 'outing') reasons.push(`Idée de sortie : ${candQuiz[q.key]}`);
      if (q.key === 'dish') reasons.push(`Team ${candQuiz[q.key]}`);
    }
  }
  score += Math.min(32, quizMatches * 8);

  // 3. Shared tags / interests (up to 12 pts)
  const viewerTags = parseJsonSafe(viewer.tags_json, []).map((t) => t.toLowerCase());
  const candTags = parseJsonSafe(candidate.tags_json, []);
  const commonTags = candTags.filter((t) => viewerTags.includes(t.toLowerCase()));
  if (commonTags.length > 0) {
    score += Math.min(12, commonTags.length * 4);
    reasons.push(`Points communs : ${commonTags.slice(0, 2).join(', ')}`);
  }

  // 4. Geographic & Passeport Babi affinity (up to 8 pts)
  const viewerEffectiveCity = viewer.passport_active && viewer.passport_target_city
    ? viewer.passport_target_city
    : viewer.city;
  const candEffectiveCity = candidate.passport_active && candidate.passport_target_city
    ? candidate.passport_target_city
    : candidate.city;

  if (viewer.commune && candidate.commune && viewer.commune === candidate.commune) {
    score += 8;
    reasons.push(`Même zone : ${candidate.commune}`);
  } else if (viewerEffectiveCity && candEffectiveCity && viewerEffectiveCity === candEffectiveCity) {
    score += 6;
    if (candidate.passport_active) {
      reasons.push(`Passeport Babi vers ${candEffectiveCity}`);
    } else {
      reasons.push(`Tous deux à ${candEffectiveCity}`);
    }
  } else if (viewer.is_diaspora !== candidate.is_diaspora) {
    score += 4;
  }

  const finalScore = Math.max(45, Math.min(99, score));
  if (reasons.length === 0) {
    reasons.push('Profil vérifié & complémentaire sur AKWABA');
  }

  return {
    score: finalScore,
    reasons: reasons.slice(0, 3),
    commonTags,
  };
}

export function matchesLookingFor(viewer, candidate) {
  if (viewer.id === candidate.id) return false;
  if (viewer.looking_for === 'women' && candidate.gender !== 'woman') return false;
  if (viewer.looking_for === 'men' && candidate.gender !== 'man') return false;
  return true;
}

export function sanitizePublicProfile(userRow, viewer = null) {
  const compatibility = viewer ? computeCompatibility(viewer, userRow) : null;
  const nowIso = new Date().toISOString();
  const hasBoost = Boolean(userRow.boost_expires_at && userRow.boost_expires_at > nowIso);

  return {
    id: userRow.id,
    name: userRow.name,
    age: userRow.age,
    gender: userRow.gender,
    commune: userRow.commune,
    city: userRow.city,
    countryCode: userRow.country_code,
    isDiaspora: Boolean(userRow.is_diaspora),
    passportActive: Boolean(userRow.passport_active),
    passportTargetCity: userRow.passport_target_city || '',
    passportArrivalDate: userRow.passport_arrival_date || '',
    passportDepartureDate: userRow.passport_departure_date || '',
    intention: userRow.intention,
    profession: userRow.profession,
    bio: userRow.bio,
    secretPrompt: userRow.secret_prompt,
    avatarUrl: userRow.avatar_url,
    voiceNoteUrl: userRow.voice_note_url || '',
    voiceDurationSec: userRow.voice_duration_sec || 0,
    tags: parseJsonSafe(userRow.tags_json, []),
    vraiBabi: parseJsonSafe(userRow.vrai_babi_json, {}),
    tonightAvailable: Boolean(userRow.tonight_available),
    tonightMood: userRow.tonight_mood,
    verified225: Boolean(userRow.verified_225),
    trustScore: userRow.trust_score,
    onlineStatus: Boolean(userRow.online_status),
    hasBoost,
    compatibility,
  };
}
