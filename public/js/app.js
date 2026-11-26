import { apiFetch, connectRealtimeSocket, getToken, setToken } from './api.js';
import {
  bindVoicePlayers,
  generateDemoVoiceBase64,
  recordMicrophoneClip,
  renderVoicePlayerHtml,
  stopActiveAudio,
} from './audio.js';
import { hydrateStaticIcons, iconSvg } from './icons.js';

const FALLBACK_META = {
  communes: [
    'Cocody • Riviera',
    'Marcory • Zone 4',
    'Plateau',
    'Yopougon',
    'Bingerville',
    'Koumassi',
    'Treichville',
    'Port-Bouët',
    'Abobo',
  ],
  cities: ['Abidjan', 'Grand-Bassam', 'Assinie', 'Yamoussoukro', 'Bouaké', 'San-Pédro', 'Korhogo', 'Daloa'],
  diasporaHubs: ['Paris • Île-de-France', 'Lyon', 'Bruxelles', 'Montréal', 'Londres', 'Genève', 'Washington DC'],
};

const state = {
  user: null,
  meta: null,
  catalog: null,
  discoverProfiles: [],
  discoverIndex: 0,
  voiceFirstMode: false,
  unlockedVoiceIds: new Set(),
  matches: [],
  admirersData: { admirers: [], isVip: false, revealCostCauris: 120 },
  spots: [],
  myBookings: [],
  tonightProfiles: [],
  activeMatchId: null,
  activeMessages: [],
  walletData: { transactions: [], orders: [] },
  safetyChallenge: null,
  ws: null,
  activeView: 'discover',
  likesTab: 'matches',
  dmTargetProfile: null,
  reactionContext: null,
  gpContext: {
    mode: 'store',
    itemCode: null,
    itemTitle: '',
    amountXof: 0,
    spotId: null,
    selectedMethod: 'wave',
    activeReference: null,
  },
  activeRecorder: null,
  selfieStream: null,
  pendingSelfieDataUrl: null,
  pendingWaPhone: '',
  adminBlobUrls: [],
  typingTimer: null,
  lastTypingSentAt: 0,
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoodLabel(rawMood) {
  const clean = String(rawMood || 'Disponible pour échanger')
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\s]+/gu, '')
    .trim();
  return clean || 'Disponible pour échanger';
}

function showToast(msg) {
  const stack = document.getElementById('toast-stack');
  while (stack.children.length >= 2) {
    stack.firstElementChild?.remove();
  }
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = msg;
  stack.appendChild(item);
  requestAnimationFrame(() => item.classList.add('visible'));
  setTimeout(() => {
    item.classList.remove('visible');
    setTimeout(() => item.remove(), 220);
  }, 2600);
}

function formatXof(n) {
  return `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
}

function formatTimeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function resolveCityFromCommune(commune) {
  const meta = state.meta || FALLBACK_META;
  if (meta.communes.includes(commune)) return 'Abidjan';
  if (commune === 'Paris • Île-de-France') return 'Paris';
  return commune;
}

function populateCommuneSelect(selectId, includeAllOption = false, currentValue = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const meta = state.meta || FALLBACK_META;
  const prev = currentValue || sel.value;

  const groups = [
    { label: 'Abidjan par communes', items: meta.communes || [] },
    { label: 'Côte d’Ivoire', items: (meta.cities || []).filter((c) => c !== 'Abidjan') },
    { label: 'Hubs Diaspora', items: meta.diasporaHubs || [] },
  ];

  let html = includeAllOption ? '<option value="all">Toute la CI &amp; Diaspora</option>' : '';
  for (const g of groups) {
    html += `<optgroup label="${escapeHtml(g.label)}">`;
    for (const item of g.items) {
      html += `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`;
    }
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  if (prev && [...sel.options].some((o) => o.value === prev)) {
    sel.value = prev;
  }
}

function populateAllLocationSelects() {
  populateCommuneSelect('reg-commune', false, 'Cocody • Riviera');
  populateCommuneSelect('filter-commune', true, 'all');
  populateCommuneSelect('edit-commune', false, state.user?.commune || 'Cocody • Riviera');
}

function updateTopbarUser() {
  const u = state.user;
  if (!u) return;
  document.getElementById('header-cauris').textContent = u.caurisBalance;
  const pill = document.getElementById('header-commune-pill');
  if (u.passportActive && u.passportTargetCity) {
    pill.innerHTML = `${iconSvg('plane', 'ak-ico-xs')} <span>Passeport : ${escapeHtml(u.passportTargetCity)}</span>`;
  } else {
    pill.textContent = u.commune;
  }

  const incogBtn = document.getElementById('btn-header-incognito');
  incogBtn.textContent = u.incognito ? 'Incognito' : 'Visible';
  incogBtn.classList.toggle('incognito-on', Boolean(u.incognito));

  const likesCount = state.matches.length + state.admirersData.admirers.length;
  const unreadTotal = state.matches.reduce((sum, m) => sum + Number(m.unreadCount || 0), 0);
  const chatBadgeVal = unreadTotal > 0 ? unreadTotal : state.matches.length;

  document.getElementById('nav-likes-count').textContent = likesCount;
  document.getElementById('nav-chat-count').textContent = chatBadgeVal;

  const mLikes = document.getElementById('m-nav-likes-count');
  const mChat = document.getElementById('m-nav-chat-count');
  if (mLikes) {
    mLikes.textContent = likesCount;
    mLikes.classList.toggle('hidden', likesCount === 0);
  }
  if (mChat) {
    mChat.textContent = chatBadgeVal;
    mChat.classList.toggle('hidden', chatBadgeVal === 0);
  }
}

function switchView(viewName) {
  stopActiveAudio();
  state.activeView = viewName;
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  document.getElementById(`view-${viewName}`)?.classList.add('active');

  document.querySelectorAll('.nav-link, .m-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (viewName === 'discover') loadDiscover();
  if (viewName === 'dates') loadDatesAndTonight();
  if (viewName === 'likes') loadLikesAndMatches();
  if (viewName === 'chat') loadChatWorkspace();
  if (viewName === 'store') loadStoreAndWallet();
  if (viewName === 'profile') loadProfileEditor();
}

async function bootstrapSession() {
  const me = await apiFetch('/auth/me');
  state.user = me.user;
  state.meta = me.meta;
  state.catalog = await apiFetch('/store/catalog');
  populateAllLocationSelects();

  document.getElementById('auth-gate').classList.remove('active');
  document.getElementById('app-shell').classList.remove('hidden');

  if (state.ws) state.ws.close();
  state.ws = connectRealtimeSocket(handleRealtimeEvent);

  const [matchesRes, admirersRes] = await Promise.all([
    apiFetch('/matches'),
    apiFetch('/likes/received'),
  ]);
  state.matches = matchesRes.matches || [];
  state.admirersData = admirersRes;
  if (!state.activeMatchId && state.matches.length > 0) {
    state.activeMatchId = state.matches[0].id;
  }

  updateTopbarUser();
  switchView(state.activeView || 'discover');

  // Auto-reconcile if returning from hosted GeniusPay checkout
  const params = new URLSearchParams(window.location.search);
  const pendingRef = localStorage.getItem('akwaba_pending_gp_ref');
  if (pendingRef && (params.get('payment') === 'success' || params.get('ref') || params.get('booking'))) {
    apiFetch(`/payments/${encodeURIComponent(pendingRef)}/status`)
      .then((res) => {
        if (res.order?.status === 'completed' || res.order?.fulfilled) {
          localStorage.removeItem('akwaba_pending_gp_ref');
          state.user = res.user;
          updateTopbarUser();
          showToast(`Paiement GeniusPay confirmé ! ${res.grantedSummary || ''}`);
          switchView(params.get('booking') ? 'dates' : 'store');
        }
      })
      .catch(() => {});
  }
}

function showRemoteTypingIndicator(matchId) {
  const match = state.matches.find((m) => m.id === matchId);
  const el = document.getElementById('chat-typing-indicator');
  const label = document.getElementById('chat-typing-label');
  if (!el || !label) return;
  label.textContent = `${match?.partner?.name || 'Votre match'} est en train d'écrire...`;
  el.classList.remove('hidden');
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => {
    el.classList.add('hidden');
  }, 2600);
}

function handleRealtimeEvent(evt) {
  if (evt.type === 'message') {
    if (state.activeView === 'chat' && evt.matchId === state.activeMatchId) {
      document.getElementById('chat-typing-indicator')?.classList.add('hidden');
      loadConversation(state.activeMatchId);
    } else {
      showToast('Nouveau message reçu dans votre Salon Privé');
      refreshCounts();
    }
  } else if (evt.type === 'typing') {
    if (state.activeView === 'chat' && evt.matchId === state.activeMatchId) {
      showRemoteTypingIndicator(evt.matchId);
    }
  } else if (evt.type === 'match') {
    showToast(`Nouveau match avec ${evt.partner?.name || 'un membre'} !`);
    refreshCounts();
  } else if (evt.type === 'payment_completed') {
    showToast(`Paiement GeniusPay confirmé : ${evt.grantedSummary || 'Compte mis à jour'}`);
    apiFetch('/auth/me').then((me) => {
      state.user = me.user;
      updateTopbarUser();
      if (state.activeView === 'store') loadStoreAndWallet();
      if (state.activeView === 'dates') loadDatesAndTonight();
    });
  } else if (evt.type === 'verification_updated') {
    const msg =
      evt.status === 'verified'
        ? `Bouclier Babi : badge Vérifié 225 activé ! Score : ${evt.trustScore}/100`
        : `Bouclier Babi : selfie refusé${evt.note ? ` (${evt.note})` : ''}. Vous pouvez réessayer.`;
    showToast(msg);
    apiFetch('/auth/me').then((me) => {
      state.user = me.user;
      updateTopbarUser();
      if (state.activeView === 'profile') loadProfileEditor();
    });
  }
}

async function refreshCounts() {
  try {
    const [matchesRes, admirersRes] = await Promise.all([
      apiFetch('/matches'),
      apiFetch('/likes/received'),
    ]);
    state.matches = matchesRes.matches || [];
    state.admirersData = admirersRes;
    updateTopbarUser();
  } catch {
    // Ignore transient errors
  }
}

// ---------------- VIEW 1: DISCOVER ----------------
async function loadDiscover(includeSwiped = false) {
  const commune = document.getElementById('filter-commune').value;
  const intention = document.getElementById('filter-intention').value;
  const verifiedOnly = document.getElementById('filter-verified').checked;
  const diasporaOnly = document.getElementById('filter-diaspora').checked;
  const onlineOnly = document.getElementById('filter-online').checked;

  const qs = new URLSearchParams({
    commune,
    intention,
    verifiedOnly: String(verifiedOnly),
    diasporaOnly: String(diasporaOnly),
    onlineOnly: String(onlineOnly),
    includeSwiped: String(includeSwiped),
  });

  const data = await apiFetch(`/profiles/discover?${qs.toString()}`);
  state.discoverProfiles = data.profiles || [];
  state.discoverIndex = 0;

  const passportEl = document.getElementById('passport-status-text');
  if (state.user?.passportActive && state.user?.passportTargetCity) {
    const datesTxt = state.user.passportArrivalDate
      ? `${state.user.passportArrivalDate}${state.user.passportDepartureDate ? ` → ${state.user.passportDepartureDate}` : ''}`
      : 'Dates flexibles';
    passportEl.textContent = `Actif vers ${state.user.passportTargetCity} (${datesTxt})`;
  } else {
    passportEl.textContent = 'Indiquez vos dates de venue à Abidjan pour matcher avant le vol.';
  }

  renderDiscoverCard();
}

function attachCardDragGesture(card, profile) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let activePointerId = null;

  const stampLike = card.querySelector('.stamp-like');
  const stampPass = card.querySelector('.stamp-pass');
  const stampSuper = card.querySelector('.stamp-super');

  const resetVisual = () => {
    card.style.transition = 'transform 280ms var(--ease-spring), opacity 220ms ease-out';
    card.style.transform = '';
    if (stampLike) stampLike.style.opacity = '0';
    if (stampPass) stampPass.style.opacity = '0';
    if (stampSuper) stampSuper.style.opacity = '0';
  };

  card.addEventListener('pointerdown', (e) => {
    if (isDragging) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (e.target.closest('button, .voice-play-bar, a, input')) return;

    isDragging = true;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
    card.style.transition = 'none';
    card.setPointerCapture?.(e.pointerId);
  });

  card.addEventListener('pointermove', (e) => {
    if (!isDragging || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    card.style.transform = `translate3d(${dx}px, ${dy * 0.45}px, 0) rotate(${dx * 0.045}deg)`;

    const isUpward = dy < -28 && Math.abs(dx) < 70;
    if (stampLike) stampLike.style.opacity = !isUpward && dx > 12 ? String(Math.min(1, dx / 95)) : '0';
    if (stampPass) stampPass.style.opacity = !isUpward && dx < -12 ? String(Math.min(1, -dx / 95)) : '0';
    if (stampSuper) stampSuper.style.opacity = isUpward ? String(Math.min(1, -dy / 85)) : '0';
  });

  const finishDrag = (e) => {
    if (!isDragging || e.pointerId !== activePointerId) return;
    isDragging = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const elapsed = Math.max(1, Date.now() - startTime);
    const velocity = Math.abs(dx) / elapsed;

    if (dx > 105 || (dx > 45 && velocity > 0.35)) {
      performSwipe('like');
    } else if (dx < -105 || (dx < -45 && velocity > 0.35)) {
      performSwipe('pass');
    } else if (dy < -95 && Math.abs(dx) < 80) {
      performSwipe('super_like');
    } else {
      resetVisual();
    }
  };

  card.addEventListener('pointerup', finishDrag);
  card.addEventListener('pointercancel', finishDrag);
}

function openReactionModal(profile, quotedText, suggestedReply) {
  if (!profile) return;
  state.reactionContext = { profile };
  document.getElementById('reaction-modal-title').textContent = `Réagir au profil de ${profile.name}`;
  document.getElementById('react-trait-quote').textContent = `"${quotedText}"`;
  document.getElementById('react-note-input').value = suggestedReply;
  document.getElementById('reaction-modal').classList.add('active');
}

function renderDiscoverCard() {
  const host = document.getElementById('discover-card-host');
  const insights = document.getElementById('discover-insights-col');
  const remaining = Math.max(0, state.discoverProfiles.length - state.discoverIndex);
  const countEl = document.getElementById('discover-online-count');
  if (countEl) countEl.textContent = remaining;

  if (state.discoverProfiles.length === 0 || state.discoverIndex >= state.discoverProfiles.length) {
    host.innerHTML = `
      <div class="surface-card panel-pad empty-deck-card">
        <span class="empty-deck-ico">${iconSvg('compass', 'ak-ico-lg')}</span>
        <h3 class="editorial-h2">Vous avez fait le tour de cette sélection</h3>
        <p class="muted-text">Élargissez la commune ou réexplorez tous les profils disponibles.</p>
        <button id="btn-reexplore-all" class="btn-primary" type="button">Réexplorer les profils</button>
      </div>
    `;
    document.getElementById('btn-reexplore-all')?.addEventListener('click', () => loadDiscover(true));
    insights.innerHTML = `
      <h3>Alchimie Culturelle</h3>
      <p class="muted-text small">Sélectionnez une nouvelle zone ou filtre pour afficher de nouveaux profils compatibles.</p>
    `;
    return;
  }

  const p = state.discoverProfiles[state.discoverIndex];
  const nextP = state.discoverProfiles[state.discoverIndex + 1];
  const score = p.compatibility?.score || 82;
  const reasons = p.compatibility?.reasons || [];
  const breakdown = p.compatibility?.breakdown || { intention: 20, culture: 16, interests: 8, geography: 6 };
  const isVoiceMasked = Boolean(state.voiceFirstMode && p.voiceNoteUrl && !state.unlockedVoiceIds.has(p.id));

  const nextCardHtml = nextP
    ? `
      <div class="hero-card-next" aria-hidden="true">
        <img class="hero-card-img ${state.voiceFirstMode && nextP.voiceNoteUrl && !state.unlockedVoiceIds.has(nextP.id) ? 'voice-masked' : ''}" src="${escapeHtml(nextP.avatarUrl)}" alt="" />
        <div class="hero-card-scrim"></div>
      </div>
    `
    : '';

  host.innerHTML = `
    <div class="card-stack-stage">
      ${nextCardHtml}
      <article id="active-hero-card" class="profile-hero-card" data-profile-id="${escapeHtml(p.id)}">
        <img class="hero-card-img ${isVoiceMasked ? 'voice-masked' : ''}" src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}" />
        <div class="hero-card-scrim"></div>

        <div class="swipe-stamp stamp-like">J'AIME</div>
        <div class="swipe-stamp stamp-pass">PASSER</div>
        <div class="swipe-stamp stamp-super">COUP DE CŒUR</div>

        ${
          isVoiceMasked
            ? `<div id="voice-mystery-pill" class="voice-mystery-pill">
                 ${iconSvg('mic', 'ak-ico-sm')}
                 <span>Coup de Foudre Vocal : écoutez 1,5 s pour révéler la photo</span>
               </div>`
            : ''
        }

        <div class="hero-top-row">
          <span class="verified-badge">
            ${p.onlineStatus ? '<span class="pulse-dot" aria-hidden="true"></span>' : ''}
            ${p.verified225 ? iconSvg('shieldCheck', 'ak-ico-xs') : ''}
            <span>${p.verified225 ? 'Vérifié 225' : 'Membre'} • ${p.trustScore}/100</span>
          </span>
          <span class="compat-pill">${score}% Alchimie</span>
        </div>

        <div class="hero-card-body">
          <h3 class="hero-name">${escapeHtml(p.name)}, ${p.age}</h3>
          <p class="hero-loc">
            ${escapeHtml(p.commune)} • ${escapeHtml(p.profession || p.city)}
            ${p.passportActive && p.passportTargetCity ? ` • Passeport vers ${escapeHtml(p.passportTargetCity)}` : ''}
          </p>
          <span class="hero-intention-tag">${escapeHtml(p.intention)}</span>
          <p class="hero-bio">${escapeHtml(p.bio)}</p>
          ${renderVoicePlayerHtml(p.voiceNoteUrl, p.voiceDurationSec, false, `Voix de ${p.name}`, p.id)}
          <div class="tag-row">
            ${(p.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      </article>
    </div>
  `;

  bindVoicePlayers(host);
  const heroCard = document.getElementById('active-hero-card');
  if (heroCard) attachCardDragGesture(heroCard, p);

  const quiz = p.vraiBabi || {};
  const tb = p.trustBreakdown || {};
  insights.innerHTML = `
    <div class="insight-block">
      <div class="panel-title-row">
        <h3>Pourquoi vous matchez (${score}%)</h3>
      </div>
      <div class="compat-bars">
        <div class="compat-bar-row"><span>Intention</span><div class="mini-meter"><div style="width:${Math.round((breakdown.intention / 30) * 100)}%"></div></div><strong>${breakdown.intention}/30</strong></div>
        <div class="compat-bar-row"><span>Culture Babi</span><div class="mini-meter"><div style="width:${Math.round((breakdown.culture / 32) * 100)}%"></div></div><strong>${breakdown.culture}/32</strong></div>
        <div class="compat-bar-row"><span>Intérêts</span><div class="mini-meter"><div style="width:${Math.round((breakdown.interests / 12) * 100)}%"></div></div><strong>${breakdown.interests}/12</strong></div>
        <div class="compat-bar-row"><span>Zone 225</span><div class="mini-meter"><div style="width:${Math.round((breakdown.geography / 8) * 100)}%"></div></div><strong>${breakdown.geography}/8</strong></div>
      </div>
      <ul class="reason-list">
        ${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
    </div>

    <div class="insight-block">
      <div class="panel-title-row" style="margin-bottom:0.35rem;">
        <p class="eyebrow" style="margin:0;">Bouclier Babi • ${p.trustScore}/100</p>
      </div>
      <div class="trust-breakdown-pills">
        ${tb.verified225 ? '<span class="trust-chip ok">Selfie 225 ✓</span>' : ''}
        ${tb.phoneVerified ? '<span class="trust-chip ok">Tél +225/Intl ✓</span>' : ''}
        ${tb.voiceBio ? '<span class="trust-chip ok">Voix authentifiée ✓</span>' : ''}
        ${tb.completeProfile ? '<span class="trust-chip ok">Profil complet ✓</span>' : ''}
      </div>
    </div>

    <div class="insight-block">
      <p class="eyebrow">Envie du soir</p>
      <p class="inline-icon-label" style="font-weight:600;font-size:0.9rem;">
        ${iconSvg('spark', 'ak-ico-xs')}
        <span>${escapeHtml(formatMoodLabel(p.tonightMood))}</span>
      </p>
    </div>

    ${
      p.secretPrompt
        ? `<div class="insight-block">
            <div class="panel-title-row" style="margin-bottom:0.35rem;">
              <p class="eyebrow" style="margin:0;">Ce qui me fait craquer</p>
              <button class="btn-text react-trigger" type="button" data-quote="${escapeHtml(p.secretPrompt)}" data-suggest="Ton secret m'a fait sourire ! ${escapeHtml(p.name)}, on en parle ?">Réagir</button>
            </div>
            <div class="secret-quote">"${escapeHtml(p.secretPrompt)}"</div>
          </div>`
        : ''
    }

    <div class="insight-block">
      <p class="eyebrow">Profil Vrai Babi (cliquez pour réagir)</p>
      <div class="quiz-mini-grid">
        <button type="button" class="quiz-mini-cell quiz-react-btn" data-quote="${escapeHtml(quiz.dish || 'Attiéké')}" data-suggest="Team ${escapeHtml(quiz.dish || 'Attiéké')} aussi ! Tu as une bonne adresse à Abidjan ?"><span>Plat</span>${escapeHtml(quiz.dish || 'À découvrir')}</button>
        <button type="button" class="quiz-mini-cell quiz-react-btn" data-quote="${escapeHtml(quiz.music || 'Zouglou')}" data-suggest="Ta bande-son ${escapeHtml(quiz.music || '')} valide tout sur le pont HKB !"><span>Musique</span>${escapeHtml(quiz.music || 'À découvrir')}</button>
        <button type="button" class="quiz-mini-cell quiz-react-btn" data-quote="${escapeHtml(quiz.outing || 'Cocody')}" data-suggest="Totalement partant(e) pour : ${escapeHtml(quiz.outing || 'un Safe Date')} !"><span>Sortie</span>${escapeHtml(quiz.outing || 'À découvrir')}</button>
        <button type="button" class="quiz-mini-cell quiz-react-btn" data-quote="${escapeHtml(quiz.family_vision || 'Complices')}" data-suggest="J'aime beaucoup ta vision (${escapeHtml(quiz.family_vision || '')})."><span>Vision</span>${escapeHtml(quiz.family_vision || 'À découvrir')}</button>
      </div>
    </div>

    <div class="insight-block">
      <p class="eyebrow">DM Direct avant match (100 Cauris)</p>
      <button class="icebreaker-btn" data-quick-dm="Salut ${escapeHtml(p.name)} ! Votre profil à ${escapeHtml(p.commune)} m'a tout de suite parlé. On discute ?">
        "Salut ${escapeHtml(p.name)} ! Votre profil à ${escapeHtml(p.commune)} m'a parlé..."
      </button>
      <button class="icebreaker-btn" data-quick-dm="Team ${escapeHtml(quiz.dish || 'Abidjan')} ici aussi ! Quand est-ce qu'on teste un bon spot Safe Date ?">
        "Team ${escapeHtml(quiz.dish || 'Abidjan')} ici aussi ! On teste un spot Safe Date ?"
      </button>
    </div>
  `;

  insights.querySelectorAll('.react-trigger, .quiz-react-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openReactionModal(p, btn.dataset.quote, btn.dataset.suggest);
    });
  });

  insights.querySelectorAll('.icebreaker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDirectMessageModal(p, btn.dataset.quickDm);
    });
  });
}

async function performSwipe(action, reactionNote = '') {
  const p = state.discoverProfiles[state.discoverIndex];
  if (!p) return;

  stopActiveAudio();
  const card = document.getElementById('active-hero-card');
  if (card) {
    card.style.transition = '';
    card.style.transform = '';
    if (action === 'pass') card.classList.add('anim-left');
    if (action === 'like') card.classList.add('anim-right');
    if (action === 'super_like') card.classList.add('anim-up');
  }

  try {
    const payload = { targetId: p.id, action };
    if (reactionNote) payload.reactionNote = reactionNote;
    const res = await apiFetch('/swipes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.caurisBalance !== undefined) {
      state.user.caurisBalance = res.caurisBalance;
      updateTopbarUser();
    }

    setTimeout(() => {
      state.discoverIndex += 1;
      renderDiscoverCard();
      if (res.isMatch && res.match) {
        openMatchCelebration(res.match);
        refreshCounts();
      } else if (action === 'pass') {
        showToast(`${p.name} passé(e)`);
      } else if (action === 'super_like') {
        showToast(`Super Coup de Cœur envoyé à ${p.name}`);
      } else if (reactionNote) {
        showToast(`Like + réaction envoyés à ${p.name}`);
      }
    }, 240);
  } catch (err) {
    card?.classList.remove('anim-left', 'anim-right', 'anim-up');
    showToast(err.message);
    if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
  }
}

function openMatchCelebration(matchObj) {
  const modal = document.getElementById('match-modal');
  document.getElementById('match-modal-desc').textContent =
    `Vous et ${matchObj.partner.name} partagez ${matchObj.compatibility_score || matchObj.compatibilityScore || 90}% d'alchimie.`;
  document.getElementById('match-me-img').src = state.user.avatarUrl;
  document.getElementById('match-partner-img').src = matchObj.partner.avatarUrl;

  document.getElementById('btn-match-open-chat').onclick = () => {
    modal.classList.remove('active');
    state.activeMatchId = matchObj.id;
    switchView('chat');
  };
  document.getElementById('btn-match-continue').onclick = () => {
    modal.classList.remove('active');
  };
  modal.classList.add('active');
}

function openDirectMessageModal(profile, presetText = '') {
  if (!profile) return;
  state.dmTargetProfile = profile;
  document.getElementById('dm-target-label').textContent =
    `Écrivez directement à ${profile.name} (${profile.commune}) avant même un match.`;
  document.getElementById('dm-message-input').value = presetText;
  document.getElementById('dm-modal').classList.add('active');
}

// ---------------- VIEW 2: CE SOIR & SAFE DATES ----------------
async function loadDatesAndTonight() {
  const [spotsRes, tonightRes] = await Promise.all([
    apiFetch('/dates/spots'),
    apiFetch('/profiles/tonight'),
  ]);
  state.spots = spotsRes.spots || [];
  state.myBookings = spotsRes.myBookings || [];
  state.tonightProfiles = tonightRes.profiles || [];

  const moodSel = document.getElementById('my-tonight-mood');
  if (state.user?.tonightMood) {
    const cleanMood = state.user.tonightMood.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const matchOpt = [...moodSel.options].find(
      (o) => o.value === state.user.tonightMood || o.value === cleanMood
    );
    if (matchOpt) moodSel.value = matchOpt.value;
  }

  const bookingsSection = document.getElementById('my-bookings-section');
  const bookingsList = document.getElementById('my-bookings-list');
  if (state.myBookings.length > 0) {
    bookingsSection.classList.remove('hidden');
    bookingsList.innerHTML = state.myBookings
      .map(
        (b) => `
        <article class="booking-card surface-card">
          <div class="booking-top">
            <strong>${escapeHtml(b.spot_name)}</strong>
            <span class="status-chip ${b.status === 'confirmed' ? '' : 'pending-chip'}">
              ${b.status === 'confirmed' ? 'Confirmé ✓' : 'En attente'}
            </span>
          </div>
          <p class="small muted-text">${escapeHtml(b.spot_commune)} • ${escapeHtml(b.booking_date)} (${b.guests_count} pers.)</p>
          <div class="booking-foot">
            <code>${escapeHtml(b.payment_reference)}</code>
            <strong>${formatXof(b.total_xof)}</strong>
          </div>
        </article>
      `
      )
      .join('');
  } else {
    bookingsSection.classList.add('hidden');
  }

  const spotsGrid = document.getElementById('safe-spots-grid');
  spotsGrid.innerHTML = state.spots
    .map(
      (s) => `
      <article class="spot-card">
        <img class="spot-img" src="${escapeHtml(s.image_url)}" alt="${escapeHtml(s.name)}" />
        <div class="card-inner-pad">
          <div class="card-meta-line">
            <strong>${escapeHtml(s.commune)}</strong>
            <span>${escapeHtml(s.category)}</span>
          </div>
          <h4>${escapeHtml(s.name)}</h4>
          <p class="muted-text small">${escapeHtml(s.vibe)}</p>
          <div class="perk-note">${escapeHtml(s.perk_akwaba)}</div>
          <p class="small"><strong>Prochain événement :</strong> ${escapeHtml(s.next_event_title)} (${escapeHtml(s.next_event_date)})</p>
          <p class="small muted-text">Budget lieu : ${escapeHtml(s.budget_xof)}</p>
          <button class="btn-primary btn-book-spot" data-spot-id="${escapeHtml(s.id)}" type="button">
            Réserver billet Safe Date (${formatXof(s.ticket_price_xof * 2)} / 2 pers.)
          </button>
        </div>
      </article>
    `
    )
    .join('');

  spotsGrid.querySelectorAll('.btn-book-spot').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spot = state.spots.find((item) => item.id === btn.dataset.spotId);
      if (spot) openGeniusPayModalForBooking(spot);
    });
  });

  const membersGrid = document.getElementById('tonight-members-grid');
  membersGrid.innerHTML = state.tonightProfiles
    .map(
      (p) => `
      <article class="member-card">
        <div class="member-img-box">
          <img src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}" />
          ${p.onlineStatus ? '<span class="card-online-badge"><span class="pulse-dot"></span> En ligne</span>' : ''}
        </div>
        <div class="card-inner-pad">
          <div class="card-meta-line">
            <strong>${escapeHtml(p.name)}, ${p.age}</strong>
            <span>${p.compatibility?.score || 85}% alchimie</span>
          </div>
          <p class="small inline-icon-label" style="color:var(--terracotta-deep);font-weight:600;">
            ${iconSvg('spark', 'ak-ico-xs')}
            <span>${escapeHtml(formatMoodLabel(p.tonightMood))}</span>
          </p>
          <p class="muted-text small">${escapeHtml(p.commune)}</p>
          <button class="btn-secondary btn-invite-tonight" data-user-id="${escapeHtml(p.id)}" type="button">
            Proposer une sortie (DM Direct)
          </button>
        </div>
      </article>
    `
    )
    .join('');

  membersGrid.querySelectorAll('.btn-invite-tonight').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.tonightProfiles.find((m) => m.id === btn.dataset.userId);
      if (p) openDirectMessageModal(p, `Salut ${p.name} ! Ton programme "${p.tonightMood}" me tente bien ce soir !`);
    });
  });
}

// ---------------- VIEW 3: ADMIRERS & MATCHES ----------------
async function loadLikesAndMatches() {
  const [matchesRes, admirersRes] = await Promise.all([
    apiFetch('/matches'),
    apiFetch('/likes/received'),
  ]);
  state.matches = matchesRes.matches || [];
  state.admirersData = admirersRes;
  updateTopbarUser();

  const matchesEl = document.getElementById('likes-tab-matches');
  if (state.matches.length === 0) {
    matchesEl.innerHTML = '<p class="muted-text">Aucun match pour le moment. Explorez le deck pour trouver votre alchimie !</p>';
  } else {
    matchesEl.innerHTML = state.matches
      .map(
        (m) => `
        <article class="member-card">
          <div class="member-img-box">
            <img src="${escapeHtml(m.partner.avatarUrl)}" alt="${escapeHtml(m.partner.name)}" />
            ${m.partner.onlineStatus ? '<span class="card-online-badge"><span class="pulse-dot"></span> En ligne</span>' : ''}
          </div>
          <div class="card-inner-pad">
            <div class="card-meta-line">
              <strong>${escapeHtml(m.partner.name)}, ${m.partner.age}</strong>
              <span class="status-chip">${m.compatibilityScore}%</span>
            </div>
            <p class="muted-text small">${escapeHtml(m.partner.commune)} • ${escapeHtml(m.partner.intention)}</p>
            <button class="btn-primary btn-open-match-chat" data-match-id="${escapeHtml(m.id)}" type="button">
              Discuter gratuitement
            </button>
          </div>
        </article>
      `
      )
      .join('');

    matchesEl.querySelectorAll('.btn-open-match-chat').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeMatchId = btn.dataset.matchId;
        switchView('chat');
      });
    });
  }

  const admirersEl = document.getElementById('likes-tab-admirers');
  const admirers = state.admirersData.admirers || [];
  if (admirers.length === 0) {
    admirersEl.innerHTML = '<p class="muted-text">Tous vos admirateurs sont déjà dans vos matchs !</p>';
  } else {
    admirersEl.innerHTML = admirers
      .map((a) => {
        const p = a.profile;
        return `
        <article class="member-card">
          <div class="member-img-box">
            <img class="${p.blurred ? 'blurred-photo' : ''}" src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}" />
          </div>
          <div class="card-inner-pad">
            <div class="card-meta-line">
              <strong>${escapeHtml(p.name)}, ${p.age}</strong>
              <span>${a.action === 'super_like' ? 'Super Cœur ★' : 'A aimé ♥'}</span>
            </div>
            <p class="muted-text small">${escapeHtml(p.commune)} • ${escapeHtml(p.intention)}</p>
            ${
              a.unlocked
                ? `<button class="btn-primary btn-like-back" data-user-id="${escapeHtml(p.id)}" type="button">Matcher &amp; discuter</button>`
                : `<button class="btn-secondary btn-reveal-admirer" data-user-id="${escapeHtml(p.id)}" type="button">Révéler (120 Cauris)</button>`
            }
          </div>
        </article>
      `;
      })
      .join('');

    admirersEl.querySelectorAll('.btn-reveal-admirer').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await apiFetch(`/likes/${btn.dataset.userId}/reveal`, { method: 'POST' });
          state.user.caurisBalance = res.caurisBalance;
          showToast(`Admirateur révélé : ${res.profile.name} !`);
          loadLikesAndMatches();
        } catch (err) {
          showToast(err.message);
          if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
        }
      });
    });

    admirersEl.querySelectorAll('.btn-like-back').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const res = await apiFetch('/swipes', {
          method: 'POST',
          body: JSON.stringify({ targetId: btn.dataset.userId, action: 'like' }),
        });
        if (res.isMatch && res.match) {
          openMatchCelebration(res.match);
          loadLikesAndMatches();
        }
      });
    });
  }
}

// ---------------- VIEW 4: SALON PRIVÉ (CHAT) ----------------
async function loadChatWorkspace() {
  const matchesRes = await apiFetch('/matches');
  state.matches = matchesRes.matches || [];
  updateTopbarUser();

  const threadsList = document.getElementById('chat-threads-list');
  if (state.matches.length === 0) {
    threadsList.innerHTML = '<p class="muted-text small" style="padding:1rem;">Aucun match pour l’instant.</p>';
    document.getElementById('chat-room-header').innerHTML = '<strong>Sélectionnez une conversation</strong>';
    document.getElementById('chat-messages-stream').innerHTML = '';
    return;
  }

  if (!state.matches.some((m) => m.id === state.activeMatchId)) {
    state.activeMatchId = state.matches[0].id;
  }

  threadsList.innerHTML = state.matches
    .map(
      (m) => `
      <div class="thread-item ${m.id === state.activeMatchId ? 'active' : ''}" data-match-id="${escapeHtml(m.id)}">
        <img src="${escapeHtml(m.partner.avatarUrl)}" alt="${escapeHtml(m.partner.name)}" />
        <div class="thread-meta">
          <div class="thread-name">
            <span>${escapeHtml(m.partner.name)}</span>
            <span class="thread-right-meta">
              ${m.unreadCount > 0 ? `<span class="count-chip">${m.unreadCount}</span>` : `<span class="small muted-text">${m.compatibilityScore}%</span>`}
            </span>
          </div>
          <div class="thread-preview">${escapeHtml(m.lastMessage?.content || 'Démarrez l’échange...')}</div>
        </div>
      </div>
    `
    )
    .join('');

  threadsList.querySelectorAll('.thread-item').forEach((el) => {
    el.addEventListener('click', () => {
      state.activeMatchId = el.dataset.matchId;
      loadChatWorkspace();
    });
  });

  renderGiftsDrawer();
  await loadConversation(state.activeMatchId);
}

function renderGiftsDrawer() {
  const drawer = document.getElementById('chat-gifts-drawer');
  const gifts = state.catalog?.culturalGifts || [];
  const giftIcons = {
    rose_abidjan: 'heart',
    bissap_frais: 'gift',
    cacao_grand_cru: 'spark',
    escapade_assinie: 'sun',
  };
  drawer.innerHTML = gifts
    .map(
      (g) => `
      <button class="gift-pill-btn" data-gift-code="${escapeHtml(g.code)}" type="button">
        ${iconSvg(giftIcons[g.code] || 'gift', 'ak-ico-xs')}
        <span>${escapeHtml(g.name)} (${g.costCauris} ${iconSvg('cauris', 'ak-ico-xs')})</span>
      </button>
    `
    )
    .join('');

  drawer.querySelectorAll('.gift-pill-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.activeMatchId) return;
      try {
        const res = await apiFetch(`/chats/${state.activeMatchId}/gift`, {
          method: 'POST',
          body: JSON.stringify({ giftCode: btn.dataset.giftCode }),
        });
        state.user.caurisBalance = res.caurisBalance;
        updateTopbarUser();
        drawer.classList.add('hidden');
        await loadConversation(state.activeMatchId);
        showToast('Cadeau culturel envoyé !');
      } catch (err) {
        showToast(err.message);
        if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
      }
    });
  });
}

function renderDateInviteBubble(m, isMe) {
  let meta = {};
  try {
    meta = JSON.parse(m.metadata_json || '{}');
  } catch {
    meta = {};
  }
  const spot = meta.spot || {};
  const status = meta.status || 'pending';
  const statusBadge =
    status === 'accepted'
      ? '<span class="status-chip">Accepté ✓</span>'
      : status === 'declined'
      ? '<span class="status-chip pending-chip">À replanifier</span>'
      : '<span class="status-chip pending-chip">En attente</span>';

  const actionBtns =
    status === 'pending' && !isMe
      ? `<div class="date-invite-actions">
           <button type="button" class="btn-primary btn-respond-date" data-msg-id="${escapeHtml(m.id)}" data-decision="accepted">Accepter ce Safe Date ✓</button>
           <button type="button" class="btn-secondary btn-respond-date" data-msg-id="${escapeHtml(m.id)}" data-decision="declined">Autre créneau</button>
         </div>`
      : '';

  return `
    <div class="date-invite-card">
      ${spot.image_url ? `<img class="date-invite-thumb" src="${escapeHtml(spot.image_url)}" alt="${escapeHtml(spot.name || 'Safe Date')}" />` : ''}
      <div class="date-invite-body">
        <div class="date-invite-head">
          <strong>${iconSvg('mapPin', 'ak-ico-xs')} ${escapeHtml(spot.name || m.content)}</strong>
          ${statusBadge}
        </div>
        <p class="small">${escapeHtml(spot.commune || '')} • <strong>${escapeHtml(meta.proposedDate || '')}</strong></p>
        ${meta.note ? `<p class="small muted-text">"${escapeHtml(meta.note)}"</p>` : ''}
        ${spot.perk_akwaba ? `<p class="small" style="color:var(--lagoon);">${escapeHtml(spot.perk_akwaba)}</p>` : ''}
        ${actionBtns}
      </div>
    </div>
  `;
}

async function loadConversation(matchId) {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) return;

  const header = document.getElementById('chat-room-header');
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;">
      <img src="${escapeHtml(match.partner.avatarUrl)}" alt="${escapeHtml(match.partner.name)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />
      <div>
        <strong>${escapeHtml(match.partner.name)}, ${match.partner.age}</strong>
        <p class="small muted-text">
          ${match.partner.onlineStatus ? '<span class="pulse-dot" aria-hidden="true"></span> En ligne • ' : ''}
          ${escapeHtml(match.partner.commune)} • ${match.partner.verified225 ? 'Vérifié 225 ✓' : 'Membre'}
        </p>
      </div>
    </div>
    <button id="btn-report-partner" class="btn-text" type="button" style="color:#991B1B;">Signaler / Bloquer</button>
  `;

  document.getElementById('btn-report-partner').addEventListener('click', async () => {
    await apiFetch('/safety/report', {
      method: 'POST',
      body: JSON.stringify({ targetId: match.partner.id, reason: 'Signalement depuis le chat', alsoBlock: true }),
    });
    showToast(`${match.partner.name} bloqué(e) et signalé(e) au Bouclier Babi.`);
    state.activeMatchId = null;
    loadChatWorkspace();
  });

  const data = await apiFetch(`/chats/${matchId}/messages`);
  state.activeMessages = data.messages || [];

  const anyFlagged = state.activeMessages.some((m) => m.scam_flagged);
  document.getElementById('chat-scam-banner').classList.toggle('hidden', !anyFlagged);

  const stream = document.getElementById('chat-messages-stream');
  stream.innerHTML = state.activeMessages
    .map((m) => {
      const isMe = m.sender_id === state.user.id;
      let extraClass = '';
      if (m.msg_type === 'gift') extraClass = 'gift-card';
      if (m.msg_type === 'date_invite') extraClass = 'date-card';

      let bodyHtml = `<p>${escapeHtml(m.content)}</p>`;
      if (m.msg_type === 'voice' && m.media_url) {
        let dur = 4;
        try {
          dur = JSON.parse(m.metadata_json || '{}').durationSec || 4;
        } catch {
          dur = 4;
        }
        bodyHtml = renderVoicePlayerHtml(m.media_url, dur, !isMe, 'Vocal');
      } else if (m.msg_type === 'date_invite') {
        bodyHtml = renderDateInviteBubble(m, isMe);
      } else if (m.msg_type === 'gift') {
        let gift = {};
        try {
          gift = JSON.parse(m.metadata_json || '{}');
        } catch {
          gift = {};
        }
        const cleanGiftText = String(m.content || '')
          .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2600-\u27BF\uFE0F\s]+/gu, '')
          .trim();
        bodyHtml = `
          <div class="gift-bubble-inner">
            <strong class="inline-icon-label">${iconSvg('gift', 'ak-ico-sm')} <span>${escapeHtml(gift.name || 'Cadeau culturel AKWABA')}</span></strong>
            <p class="small" style="margin-top:0.25rem;">${escapeHtml(gift.message || cleanGiftText)}</p>
          </div>
        `;
      }

      return `
        <div class="msg-bubble ${isMe ? 'me' : 'them'} ${extraClass}">
          ${bodyHtml}
          ${m.scam_flagged ? `<div class="msg-scam-note">Bouclier Babi : ${escapeHtml(m.scam_reason)}</div>` : ''}
          <span class="msg-time">${formatTimeShort(m.created_at)}</span>
        </div>
      `;
    })
    .join('');

  stream.querySelectorAll('.btn-respond-date').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await apiFetch(`/chats/${matchId}/messages/${btn.dataset.msgId}/respond-date`, {
          method: 'POST',
          body: JSON.stringify({ decision: btn.dataset.decision }),
        });
        showToast(btn.dataset.decision === 'accepted' ? 'Safe Date confirmé !' : 'Réponse envoyée.');
        await loadConversation(matchId);
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  bindVoicePlayers(stream);
  stream.scrollTop = stream.scrollHeight;
  refreshCounts();
}

async function openSafeDateModal() {
  if (!state.activeMatchId) return;
  if (!state.spots.length) {
    const spotsRes = await apiFetch('/dates/spots');
    state.spots = spotsRes.spots || [];
    state.myBookings = spotsRes.myBookings || [];
  }
  const select = document.getElementById('sd-spot-select');
  select.innerHTML = state.spots
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} — ${escapeHtml(s.commune)}</option>`)
    .join('');

  const updatePreview = () => {
    const spot = state.spots.find((s) => s.id === select.value) || state.spots[0];
    if (spot) {
      document.getElementById('sd-spot-preview').textContent = `${spot.perk_akwaba} • Budget : ${spot.budget_xof}`;
    }
  };
  select.onchange = updatePreview;
  updatePreview();
  document.getElementById('sd-note-input').value = '';
  document.getElementById('safedate-modal').classList.add('active');
}

// ---------------- VIEW 5: STORE & GENIUSPAY ----------------
async function loadStoreAndWallet() {
  const [catalog, wallet] = await Promise.all([
    apiFetch('/store/catalog'),
    apiFetch('/wallet'),
  ]);
  state.catalog = catalog;
  state.walletData = wallet;
  state.user = wallet.user;
  updateTopbarUser();

  document.getElementById('store-cauris-balance').textContent = state.user.caurisBalance;
  const activeTier = state.user.subscriptionTier;
  document.getElementById('store-subscription-status').textContent =
    activeTier && activeTier !== 'free'
      ? `Pass actif : ${activeTier.toUpperCase()} (Expire le ${new Date(state.user.subscriptionExpiresAt).toLocaleDateString('fr-FR')})`
      : 'Compte Gratuit — Les discussions après match sont déjà illimitées.';
  document.getElementById('store-streak-info').textContent = `Série actuelle : ${state.user.checkinStreak || 0} jour(s)`;

  const passesGrid = document.getElementById('store-passes-grid');
  passesGrid.innerHTML = catalog.subscriptions
    .map(
      (s) => `
      <article class="price-card ${s.popular ? 'featured' : ''}">
        <span class="eyebrow">${s.popular ? 'Le plus choisi en CI' : 'Pass Flexible'}</span>
        <h4>${escapeHtml(s.name)}</h4>
        <div class="price-tag">${formatXof(s.priceXof)}</div>
        <p class="muted-text small">${escapeHtml(s.tagline)}</p>
        <ul class="perk-list">
          ${s.perks.map((pk) => `<li>• ${escapeHtml(pk)}</li>`).join('')}
        </ul>
        <button class="btn-primary btn-buy-item" data-item-code="${escapeHtml(s.code)}" type="button">
          Payer via GeniusPay
        </button>
      </article>
    `
    )
    .join('');

  const caurisGrid = document.getElementById('store-cauris-grid');
  caurisGrid.innerHTML = catalog.caurisPacks
    .map(
      (p) => `
      <article class="price-card ${p.popular ? 'featured' : ''}">
        <span class="eyebrow">Sans abonnement</span>
        <h4>${escapeHtml(p.name)}</h4>
        <div class="price-tag">${formatXof(p.priceXof)}</div>
        <p class="muted-text small">${escapeHtml(p.tagline)}</p>
        <button class="btn-secondary btn-buy-item" data-item-code="${escapeHtml(p.code)}" type="button">
          Acheter via GeniusPay
        </button>
      </article>
    `
    )
    .join('');

  document.querySelectorAll('.btn-buy-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.itemCode;
      const all = [...catalog.subscriptions, ...catalog.caurisPacks];
      const item = all.find((x) => x.code === code);
      if (item) openGeniusPayModalForItem(item);
    });
  });

  const ordersEl = document.getElementById('store-orders-list');
  ordersEl.innerHTML = (wallet.orders || []).length
    ? wallet.orders
        .map(
          (o) => `
          <div class="history-row">
            <div>
              <strong>${escapeHtml(o.reference)}</strong> • ${escapeHtml(o.item_code)}
              <div class="small muted-text">${escapeHtml(o.payment_method || 'checkout')} • ${escapeHtml(o.status)}</div>
            </div>
            <strong>${formatXof(o.amount_xof)}</strong>
          </div>
        `
        )
        .join('')
    : '<p class="muted-text small">Aucune commande GeniusPay pour le moment.</p>';

  const txEl = document.getElementById('store-transactions-list');
  txEl.innerHTML = (wallet.transactions || []).length
    ? wallet.transactions
        .map(
          (t) => `
          <div class="history-row">
            <span>${escapeHtml(t.reason)}</span>
            <strong style="color:${t.tx_type === 'credit' ? 'var(--lagoon)' : 'var(--terracotta)'};">
              ${t.tx_type === 'credit' ? '+' : '-'}${t.amount_cauris} ${iconSvg('cauris', 'ak-ico-xs')}
            </strong>
          </div>
        `
        )
        .join('')
    : '<p class="muted-text small">Aucune opération enregistrée.</p>';
}

function openGeniusPayModalForItem(item) {
  state.gpContext = {
    mode: 'store',
    itemCode: item.code,
    itemTitle: item.name,
    amountXof: item.priceXof,
    spotId: null,
    selectedMethod: 'wave',
    activeReference: null,
  };
  renderGeniusPayModal();
}

function openGeniusPayModalForBooking(spot) {
  state.gpContext = {
    mode: 'booking',
    itemCode: `event_${spot.id}`,
    itemTitle: `Safe Date • ${spot.name} (2 pers.)`,
    amountXof: spot.ticket_price_xof * 2,
    spotId: spot.id,
    selectedMethod: 'wave',
    activeReference: null,
  };
  renderGeniusPayModal();
}

function renderGeniusPayModal() {
  const modal = document.getElementById('geniuspay-modal');
  document.getElementById('gp-item-title').textContent = state.gpContext.itemTitle;
  document.getElementById('gp-amount-display').textContent = formatXof(state.gpContext.amountXof);
  document.getElementById('gp-phone-input').value = state.user?.phone || '+2250708112233';
  document.getElementById('gp-step-select').classList.remove('hidden');
  document.getElementById('gp-step-checkout').classList.add('hidden');

  const methods = state.catalog?.paymentMethods || [];
  const listEl = document.getElementById('gp-method-list');
  listEl.innerHTML = methods
    .map(
      (m) => `
      <button type="button" class="gp-method-opt ${m.code === state.gpContext.selectedMethod ? 'selected' : ''}" data-method="${escapeHtml(m.code)}">
        <strong>${escapeHtml(m.label)}</strong>
        <span class="muted-text small">${escapeHtml(m.badge)}</span>
      </button>
    `
    )
    .join('');

  const updateFeeNote = () => {
    const m = methods.find((x) => x.code === state.gpContext.selectedMethod) || methods[0];
    if (!m) return;
    const fees = Math.round(state.gpContext.amountXof * (m.operatorFeePct + m.geniusFeePct) + m.geniusFixedXof);
    document.getElementById('gp-fees-note').textContent =
      `Estimation frais GeniusPay (${m.label}) : ~${formatXof(fees)} • Net marchand : ${formatXof(state.gpContext.amountXof - fees)}`;
  };
  updateFeeNote();

  listEl.querySelectorAll('.gp-method-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.gpContext.selectedMethod = btn.dataset.method;
      listEl.querySelectorAll('.gp-method-opt').forEach((b) => b.classList.toggle('selected', b === btn));
      updateFeeNote();
    });
  });

  modal.classList.add('active');
}

// ---------------- VIEW 6: PROFILE & BOUCLIER BABI ----------------
function renderAvatarPresets(currentUrl) {
  const host = document.getElementById('profile-avatar-presets');
  if (!host) return;
  const presets = state.meta?.avatarPresets || [];
  host.innerHTML = presets
    .map(
      (a) => `
      <button type="button" class="avatar-preset-btn ${a.url === currentUrl ? 'selected' : ''}" data-avatar-url="${escapeHtml(a.url)}" title="${escapeHtml(a.label)}">
        <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.label)}" />
      </button>
    `
    )
    .join('');

  host.querySelectorAll('.avatar-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.avatarUrl;
      document.getElementById('edit-avatar-url').value = url;
      document.getElementById('me-preview-photo').src = url;
      host.querySelectorAll('.avatar-preset-btn').forEach((b) => b.classList.toggle('selected', b === btn));
    });
  });
}

async function loadProfileEditor() {
  const [meRes, safetyRes] = await Promise.all([
    apiFetch('/auth/me'),
    apiFetch('/safety/challenge'),
  ]);
  state.user = meRes.user;
  state.meta = meRes.meta;
  state.safetyChallenge = safetyRes.challenge;
  populateCommuneSelect('edit-commune', false, state.user.commune);
  updateTopbarUser();

  const u = state.user;
  document.getElementById('me-preview-photo').src = u.avatarUrl;
  document.getElementById('edit-avatar-url').value = u.avatarUrl;
  renderAvatarPresets(u.avatarUrl);

  document.getElementById('me-preview-name').textContent = `${u.name}, ${u.age}`;
  document.getElementById('me-preview-meta').textContent = `${u.commune} • ${u.intention}`;
  document.getElementById('me-badges-row').innerHTML = `
    ${u.verified225 ? '<span class="status-chip">Vérifié 225 ✓</span>' : '<span class="status-chip pending-chip">Non vérifié</span>'}
    ${u.phoneVerified ? '<span class="status-chip">Tél vérifié</span>' : ''}
    ${u.subscriptionTier !== 'free' ? `<span class="status-chip">${escapeHtml(u.subscriptionTier)}</span>` : ''}
  `;

  document.getElementById('me-trust-score').textContent = `${u.trustScore}/100`;
  document.getElementById('me-trust-fill').style.width = `${u.trustScore}%`;

  const bd = safetyRes.breakdown || u.trustBreakdown || {};
  document.getElementById('me-trust-breakdown').innerHTML = `
    <span class="trust-chip ok">Base ${bd.base || 40}</span>
    <span class="trust-chip ${bd.phoneVerified ? 'ok' : ''}">Tél ${bd.phoneVerified ? '+15 ✓' : '+0'}</span>
    <span class="trust-chip ${bd.selfieVerified225 ? 'ok' : ''}">Selfie 225 ${bd.selfieVerified225 ? '+25 ✓' : '+0'}</span>
    <span class="trust-chip ${bd.voiceBio ? 'ok' : ''}">Voix ${bd.voiceBio ? '+10 ✓' : '+0'}</span>
    <span class="trust-chip ${bd.completeProfile ? 'ok' : ''}">Profil ${bd.completeProfile ? '+10 ✓' : '+0'}</span>
  `;

  document.getElementById('me-referral-code').textContent = u.referralCode;
  document.getElementById('safety-challenge-label').textContent =
    `Défi du jour : "${safetyRes.challenge.label}" — ${safetyRes.challenge.tip}`;
  document.getElementById('input-verify-phone').value = u.phone || '';

  const verifBanner = document.getElementById('safety-verif-status');
  const latestVerif = safetyRes.latestVerification;
  if (verifBanner) {
    verifBanner.classList.remove('hidden', 'is-verified', 'is-pending', 'is-rejected');
    if (u.verified225 || latestVerif?.status === 'verified') {
      verifBanner.classList.add('is-verified');
      const detail = latestVerif?.reviewerNote || latestVerif?.aiReason || 'Identité confirmée par Bouclier Babi.';
      verifBanner.innerHTML = `<strong>Vérifié 225 ✓</strong><span>${escapeHtml(detail)}</span>`;
    } else if (latestVerif?.status === 'pending_review') {
      verifBanner.classList.add('is-pending');
      verifBanner.innerHTML = `<strong>En attente de modération</strong><span>${escapeHtml(latestVerif.aiReason || 'Cliché reçu — vérification en cours par notre équipe.')}</span>`;
    } else if (latestVerif?.status === 'rejected') {
      verifBanner.classList.add('is-rejected');
      verifBanner.innerHTML = `<strong>Selfie refusé — nouvel essai requis</strong><span>${escapeHtml(latestVerif.reviewerNote || latestVerif.aiReason || 'Le geste ou le visage n’a pas pu être validé.')}</span>`;
    } else {
      verifBanner.classList.add('hidden');
    }
  }

  const voiceHost = document.getElementById('me-voice-player-host');
  voiceHost.innerHTML = u.voiceNoteUrl
    ? renderVoicePlayerHtml(u.voiceNoteUrl, u.voiceDurationSec, true, 'Ma bio vocale', u.id)
    : '<p class="muted-text small">Aucune note vocale enregistrée.</p>';
  bindVoicePlayers(voiceHost);

  document.getElementById('edit-name').value = u.name;
  document.getElementById('edit-age').value = u.age;
  document.getElementById('edit-commune').value = u.commune;
  document.getElementById('edit-intention').value = u.intention;
  document.getElementById('edit-profession').value = u.profession || '';
  document.getElementById('edit-looking').value = u.lookingFor === 'all' ? 'everyone' : u.lookingFor;
  document.getElementById('edit-bio').value = u.bio;
  document.getElementById('edit-secret').value = u.secretPrompt || '';
  document.getElementById('edit-tags').value = (u.tags || []).join(', ');
  document.getElementById('edit-passport-city').value = u.passportTargetCity || '';
  document.getElementById('edit-passport-arrival').value = u.passportArrivalDate || '';
  document.getElementById('edit-passport-departure').value = u.passportDepartureDate || '';

  const quizHost = document.getElementById('vrai-babi-quiz-fields');
  const questions = state.meta?.vraiBabiQuestions || [];
  quizHost.innerHTML =
    '<h4>Quiz Culturel « Vrai Babi » (alimente votre score d’alchimie)</h4>' +
    questions
      .map(
        (q) => `
      <div class="field">
        <label for="quiz-${escapeHtml(q.key)}">${escapeHtml(q.label)}</label>
        <select id="quiz-${escapeHtml(q.key)}" data-quiz-key="${escapeHtml(q.key)}">
          ${q.options
            .map(
              (opt) =>
                `<option value="${escapeHtml(opt)}" ${u.vraiBabi?.[q.key] === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
            )
            .join('')}
        </select>
      </div>
    `
      )
      .join('');
}

// ---------------- INITIALIZE EVENT LISTENERS ----------------
document.addEventListener('DOMContentLoaded', () => {
  hydrateStaticIcons(document);
  populateAllLocationSelects();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Voice-First progressive portrait unlock
  document.addEventListener('akwaba:voice-progress', (evt) => {
    const { profileId, currentTime, completed } = evt.detail || {};
    if (!profileId) return;
    if ((currentTime >= 1.5 || completed) && !state.unlockedVoiceIds.has(profileId)) {
      state.unlockedVoiceIds.add(profileId);
      const card = document.getElementById('active-hero-card');
      if (card && card.dataset.profileId === profileId) {
        const img = card.querySelector('.hero-card-img');
        if (img && img.classList.contains('voice-masked')) {
          img.classList.remove('voice-masked');
          document.getElementById('voice-mystery-pill')?.classList.add('fade-out');
          showToast('Portrait révélé après écoute vocale !');
        }
      }
    }
  });

  // Modal Escape & Backdrop Close
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('active');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.active').forEach((m) => m.classList.remove('active'));
    }
  });

  // Auth Tabs
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.authMode === 'login';
      document.getElementById('login-form').classList.toggle('hidden', !isLogin);
      document.getElementById('register-form').classList.toggle('hidden', isLogin);
    });
  });

  // Demo quick buttons
  document.getElementById('btn-demo-kouame').addEventListener('click', async () => {
    const res = await apiFetch('/auth/demo', { method: 'POST', body: JSON.stringify({ persona: 'kouame' }) });
    setToken(res.token);
    await bootstrapSession();
    showToast('Akwaba Kouamé !');
  });

  document.getElementById('btn-demo-aya').addEventListener('click', async () => {
    const res = await apiFetch('/auth/demo', { method: 'POST', body: JSON.stringify({ persona: 'aya' }) });
    setToken(res.token);
    await bootstrapSession();
    showToast('Akwaba Aya !');
  });

  // Login & Register
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('login-email').value,
          password: document.getElementById('login-password').value,
        }),
      });
      setToken(res.token);
      await bootstrapSession();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const commune = document.getElementById('reg-commune').value;
      const city = resolveCityFromCommune(commune);
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('reg-name').value,
          age: Number(document.getElementById('reg-age').value),
          gender: document.getElementById('reg-gender').value,
          lookingFor: document.getElementById('reg-looking').value,
          commune,
          city,
          intention: document.getElementById('reg-intention').value,
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-password').value,
          referralCodeUsed: document.getElementById('reg-referral').value,
        }),
      });
      setToken(res.token);
      await bootstrapSession();
      showToast('Bienvenue sur AKWABA ! +50 Cauris offerts.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    setToken('');
    state.user = null;
    if (state.ws) state.ws.close();
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-gate').classList.add('active');
  });

  // Navigation
  document.querySelectorAll('.nav-link, .m-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('btn-brand-home').addEventListener('click', () => switchView('discover'));
  document.getElementById('btn-wallet-shortcut').addEventListener('click', () => switchView('store'));
  document.getElementById('btn-open-passport').addEventListener('click', () => switchView('profile'));

  // Incognito toggles
  const toggleIncognito = async () => {
    try {
      const res = await apiFetch('/profiles/me/incognito', { method: 'POST' });
      state.user = res.user;
      updateTopbarUser();
      showToast(res.incognito ? 'Mode Incognito activé.' : 'Profil visible dans la découverte.');
    } catch (err) {
      showToast(err.message);
      if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
    }
  };
  document.getElementById('btn-header-incognito').addEventListener('click', toggleIncognito);
  document.getElementById('btn-toggle-incognito-profile').addEventListener('click', toggleIncognito);

  // Voice-First toggle
  document.getElementById('toggle-voice-first').addEventListener('change', (e) => {
    state.voiceFirstMode = e.target.checked;
    renderDiscoverCard();
    showToast(
      state.voiceFirstMode
        ? 'Mode Coup de Foudre Vocal activé : la voix précède le visage.'
        : 'Affichage classique des portraits rétabli.'
    );
  });

  // Discover filters & actions
  ['filter-commune', 'filter-intention', 'filter-verified', 'filter-diaspora', 'filter-online'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => loadDiscover());
  });
  document.getElementById('btn-reset-filters').addEventListener('click', () => {
    document.getElementById('filter-commune').value = 'all';
    document.getElementById('filter-intention').value = 'all';
    document.getElementById('filter-verified').checked = false;
    document.getElementById('filter-diaspora').checked = false;
    document.getElementById('filter-online').checked = false;
    loadDiscover(true);
  });

  document.getElementById('btn-swipe-pass').addEventListener('click', () => performSwipe('pass'));
  document.getElementById('btn-swipe-like').addEventListener('click', () => performSwipe('like'));
  document.getElementById('btn-swipe-super').addEventListener('click', () => performSwipe('super_like'));
  document.getElementById('btn-open-dm').addEventListener('click', () => {
    const p = state.discoverProfiles[state.discoverIndex];
    if (p) openDirectMessageModal(p);
  });
  document.getElementById('btn-rewind-pass').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/swipes/rewind', { method: 'POST' });
      state.user.caurisBalance = res.caurisBalance;
      updateTopbarUser();
      if (res.restoredProfile) {
        state.discoverProfiles.unshift(res.restoredProfile);
        state.discoverIndex = 0;
        renderDiscoverCard();
        showToast(`${res.restoredProfile.name} restauré(e) dans le deck.`);
      }
    } catch (err) {
      showToast(err.message);
      if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!state.user || state.activeView !== 'discover') return;
    if (document.querySelector('.modal-backdrop.active')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') performSwipe('pass');
    if (e.key === 'ArrowRight') performSwipe('like');
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      performSwipe('super_like');
    }
  });

  // DM Modal
  const closeDmModal = () => document.getElementById('dm-modal').classList.remove('active');
  document.getElementById('btn-close-dm-modal').addEventListener('click', closeDmModal);
  document.getElementById('btn-dm-cancel').addEventListener('click', closeDmModal);
  document.getElementById('dm-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.dmTargetProfile) return;
    const text = document.getElementById('dm-message-input').value.trim();
    if (!text) return;
    try {
      const res = await apiFetch('/chats/direct', {
        method: 'POST',
        body: JSON.stringify({ targetId: state.dmTargetProfile.id, content: text }),
      });
      state.user.caurisBalance = res.caurisBalance;
      updateTopbarUser();
      closeDmModal();
      state.activeMatchId = res.matchId;
      showToast('DM Direct envoyé !');
      switchView('chat');
    } catch (err) {
      showToast(err.message);
      if (err.code === 'INSUFFICIENT_CAURIS') {
        closeDmModal();
        switchView('store');
      }
    }
  });

  // Contextual Reaction Modal
  const closeReactModal = () => document.getElementById('reaction-modal').classList.remove('active');
  document.getElementById('btn-close-reaction-modal').addEventListener('click', closeReactModal);
  document.getElementById('btn-react-cancel').addEventListener('click', closeReactModal);
  document.getElementById('reaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = document.getElementById('react-note-input').value.trim();
    if (!note) return;
    closeReactModal();
    await performSwipe('like', note);
  });

  // Safe Date Invite Modal
  const closeSdModal = () => document.getElementById('safedate-modal').classList.remove('active');
  document.getElementById('btn-close-sd-modal').addEventListener('click', closeSdModal);
  document.getElementById('btn-sd-cancel').addEventListener('click', closeSdModal);
  document.querySelectorAll('.sd-preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('sd-date-input').value = chip.dataset.slot;
    });
  });
  document.getElementById('safedate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeMatchId) return;
    const spotId = document.getElementById('sd-spot-select').value;
    const proposedDate = document.getElementById('sd-date-input').value.trim();
    const note = document.getElementById('sd-note-input').value.trim();
    try {
      await apiFetch(`/chats/${state.activeMatchId}/date-invite`, {
        method: 'POST',
        body: JSON.stringify({ spotId, proposedDate, note }),
      });
      closeSdModal();
      await loadConversation(state.activeMatchId);
      showToast('Invitation Safe Date envoyée !');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Tonight Mood Selector
  document.getElementById('my-tonight-mood').addEventListener('change', async (e) => {
    const res = await apiFetch('/profiles/me', {
      method: 'PUT',
      body: JSON.stringify({ tonightMood: e.target.value, tonightAvailable: true }),
    });
    state.user = res.user;
    showToast('Envie du soir mise à jour !');
  });

  // Likes Subtabs
  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.likesTab;
      document.getElementById('likes-tab-matches').classList.toggle('hidden', tab !== 'matches');
      document.getElementById('likes-tab-admirers').classList.toggle('hidden', tab !== 'admirers');
    });
  });

  // Chat Controls & Typing Indicator
  const chatInput = document.getElementById('chat-text-input');
  chatInput.addEventListener('input', () => {
    const now = Date.now();
    if (now - state.lastTypingSentAt < 1800) return;
    if (!state.activeMatchId || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    const match = state.matches.find((m) => m.id === state.activeMatchId);
    if (!match) return;
    state.lastTypingSentAt = now;
    state.ws.send(JSON.stringify({ type: 'typing', matchId: match.id, recipientId: match.partner.id }));
  });

  document.getElementById('chat-send-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeMatchId) return;
    const content = chatInput.value.trim();
    if (!content) return;
    chatInput.value = '';
    const res = await apiFetch(`/chats/${state.activeMatchId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (res.scamCheck?.flagged) {
      showToast(`Bouclier Babi : ${res.scamCheck.reason}`);
    }
    await loadConversation(state.activeMatchId);
  });

  document.querySelectorAll('.chat-tools-strip [data-ice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.dataset.ice;
      chatInput.focus();
    });
  });

  document.getElementById('btn-toggle-gifts').addEventListener('click', () => {
    document.getElementById('chat-gifts-drawer').classList.toggle('hidden');
  });

  document.getElementById('btn-invite-safedate').addEventListener('click', openSafeDateModal);

  const chatVoiceBtn = document.getElementById('btn-record-chat-voice');
  chatVoiceBtn.addEventListener('click', async () => {
    if (!state.activeMatchId) return;
    if (state.activeRecorder) {
      const clip = await state.activeRecorder.stop();
      state.activeRecorder = null;
      chatVoiceBtn.classList.remove('recording');
      chatVoiceBtn.innerHTML = `${iconSvg('mic', 'ak-ico-sm')}<span>Vocal</span>`;
      await apiFetch(`/chats/${state.activeMatchId}/voice`, {
        method: 'POST',
        body: JSON.stringify(clip),
      });
      await loadConversation(state.activeMatchId);
      return;
    }

    try {
      state.activeRecorder = await recordMicrophoneClip();
      chatVoiceBtn.classList.add('recording');
      chatVoiceBtn.textContent = 'Stop';
    } catch {
      const demo = generateDemoVoiceBase64();
      await apiFetch(`/chats/${state.activeMatchId}/voice`, {
        method: 'POST',
        body: JSON.stringify(demo),
      });
      await loadConversation(state.activeMatchId);
      showToast('Note vocale envoyée (mode micro démo)');
    }
  });

  // Store & GeniusPay Modal
  document.getElementById('btn-claim-daily').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/wallet/daily-checkin', { method: 'POST' });
      showToast(res.message);
      await loadStoreAndWallet();
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('btn-close-gp-modal').addEventListener('click', () => {
    document.getElementById('geniuspay-modal').classList.remove('active');
  });

  document.getElementById('btn-gp-initiate').addEventListener('click', async () => {
    try {
      const phone = document.getElementById('gp-phone-input').value.trim();
      let checkoutData;
      if (state.gpContext.mode === 'booking') {
        checkoutData = await apiFetch('/dates/bookings', {
          method: 'POST',
          body: JSON.stringify({
            spotId: state.gpContext.spotId,
            guestsCount: 2,
            paymentMethod: state.gpContext.selectedMethod,
            customerPhone: phone,
          }),
        });
      } else {
        checkoutData = await apiFetch('/payments/checkout', {
          method: 'POST',
          body: JSON.stringify({
            itemCode: state.gpContext.itemCode,
            paymentMethod: state.gpContext.selectedMethod,
            customerPhone: phone,
          }),
        });
      }

      state.gpContext.activeReference = checkoutData.reference;
      document.getElementById('gp-ref-code').textContent = checkoutData.reference;
      const isSimulated = Boolean(checkoutData.simulated);
      if (!isSimulated) {
        localStorage.setItem('akwaba_pending_gp_ref', checkoutData.reference);
      }

      document.getElementById('gp-checkout-status-msg').textContent = isSimulated
        ? `Session Simulateur local prête (${state.gpContext.selectedMethod}). Validez ci-dessous pour déclencher le Webhook HMAC-SHA256.`
        : `Session GeniusPay (${checkoutData.environment || 'sandbox'}) créée. Finalisez le paiement sur la page sécurisée GeniusPay ci-dessous, puis vérifiez le statut.`;

      const extLink = document.getElementById('gp-external-link');
      const checkBtn = document.getElementById('btn-gp-check-status');
      const simOkBtn = document.getElementById('btn-gp-confirm-sandbox');
      const simFailBtn = document.getElementById('btn-gp-fail-sandbox');

      if (!isSimulated && checkoutData.checkoutUrl) {
        extLink.href = checkoutData.checkoutUrl;
        extLink.classList.remove('hidden');
        checkBtn.classList.remove('hidden');
        simOkBtn.classList.add('hidden');
        simFailBtn.classList.add('hidden');
      } else {
        extLink.classList.add('hidden');
        checkBtn.classList.add('hidden');
        simOkBtn.classList.remove('hidden');
        simFailBtn.classList.remove('hidden');
      }

      document.getElementById('gp-step-select').classList.add('hidden');
      document.getElementById('gp-step-checkout').classList.remove('hidden');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('btn-gp-check-status').addEventListener('click', async () => {
    const ref = state.gpContext.activeReference;
    if (!ref) return;
    try {
      const res = await apiFetch(`/payments/${encodeURIComponent(ref)}/status`);
      const st = res.order?.status;
      if (st === 'completed' || res.order?.fulfilled) {
        localStorage.removeItem('akwaba_pending_gp_ref');
        document.getElementById('geniuspay-modal').classList.remove('active');
        state.user = res.user;
        updateTopbarUser();
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
          showToast(`Paiement GeniusPay validé ! ${res.grantedSummary || ''}`);
        }
        if (state.activeView === 'store') loadStoreAndWallet();
        if (state.activeView === 'dates') loadDatesAndTonight();
      } else if (['failed', 'cancelled', 'expired'].includes(st)) {
        localStorage.removeItem('akwaba_pending_gp_ref');
        document.getElementById('gp-checkout-status-msg').textContent =
          `Transaction ${ref} terminée avec le statut : ${st}.`;
        showToast(`Paiement ${st}.`);
      } else {
        document.getElementById('gp-checkout-status-msg').textContent =
          `Statut actuel sur GeniusPay : ${st || 'pending'}. Terminez le paiement sur la page checkout puis revérifiez.`;
        showToast('Paiement toujours en attente sur GeniusPay.');
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  const completeSandboxPayment = async (outcome) => {
    if (!state.gpContext.activeReference) return;
    const res = await apiFetch('/payments/sandbox/complete', {
      method: 'POST',
      body: JSON.stringify({
        reference: state.gpContext.activeReference,
        paymentMethod: state.gpContext.selectedMethod,
        outcome,
      }),
    });
    document.getElementById('geniuspay-modal').classList.remove('active');
    if (outcome === 'success') {
      state.user = res.user;
      updateTopbarUser();
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        showToast(`Paiement GeniusPay validé ! ${res.fulfillment?.grantedSummary || ''}`);
      }
      if (state.activeView === 'store') loadStoreAndWallet();
      if (state.activeView === 'dates') loadDatesAndTonight();
    } else {
      showToast('Paiement annulé / échoué.');
    }
  };

  document.getElementById('btn-gp-confirm-sandbox').addEventListener('click', () => completeSandboxPayment('success'));
  document.getElementById('btn-gp-fail-sandbox').addEventListener('click', () => completeSandboxPayment('failed'));

  // Profile Avatar Upload & Bouclier Babi
  document.getElementById('btn-upload-avatar').addEventListener('click', () => {
    document.getElementById('input-avatar-file').click();
  });

  document.getElementById('input-avatar-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Photo limitée à 2 Mo.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await apiFetch('/profiles/me/avatar', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: reader.result }),
        });
        state.user = res.user;
        document.getElementById('me-preview-photo').src = res.avatarUrl;
        document.getElementById('edit-avatar-url').value = res.avatarUrl;
        renderAvatarPresets(res.avatarUrl);
        showToast('Photo de profil mise à jour !');
      } catch (err) {
        showToast(err.message);
      }
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-boost-profile').addEventListener('click', async () => {
    try {
      const res = await apiFetch('/profiles/me/boost', { method: 'POST' });
      state.user = res.user;
      updateTopbarUser();
      showToast('Boost Tête d’affiche activé pour 24h !');
    } catch (err) {
      showToast(err.message);
      if (err.code === 'INSUFFICIENT_CAURIS') switchView('store');
    }
  });

  document.getElementById('btn-copy-referral').addEventListener('click', () => {
    const code = state.user?.referralCode || '';
    navigator.clipboard?.writeText(code).catch(() => {});
    showToast(`Code parrain copié : ${code}`);
  });

  const clearSelfiePreview = () => {
    state.pendingSelfieDataUrl = null;
    const input = document.getElementById('input-selfie-file');
    if (input) input.value = '';
    document.getElementById('selfie-preview-box')?.classList.add('hidden');
  };

  document.getElementById('btn-clear-selfie-preview').addEventListener('click', clearSelfiePreview);

  document.getElementById('btn-upload-selfie').addEventListener('click', () => {
    document.getElementById('input-selfie-file').click();
  });

  document.getElementById('input-selfie-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('Le selfie ne doit pas dépasser 3 Mo.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      state.pendingSelfieDataUrl = String(reader.result || '');
      const img = document.getElementById('selfie-preview-img');
      if (img) img.src = state.pendingSelfieDataUrl;
      document.getElementById('selfie-preview-box')?.classList.remove('hidden');
      showToast('Cliché chargé — cliquez sur « Envoyer le Selfie 225 ».');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-start-selfie-cam').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      state.selfieStream = stream;
      const stage = document.getElementById('selfie-camera-stage');
      stage.classList.remove('hidden');
      document.getElementById('selfie-video').srcObject = stream;
    } catch {
      showToast('Caméra indisponible — utilisez « Importer un selfie » (JPEG/PNG/WebP).');
    }
  });

  document.getElementById('btn-submit-selfie').addEventListener('click', async () => {
    let imageDataUrl = state.pendingSelfieDataUrl;
    const videoEl = document.getElementById('selfie-video');
    const canvasEl = document.getElementById('selfie-canvas');
    if (state.selfieStream && videoEl && canvasEl && videoEl.videoWidth > 0) {
      canvasEl.width = 480;
      canvasEl.height = 360;
      const ctx = canvasEl.getContext('2d');
      ctx?.drawImage(videoEl, 0, 0, 480, 360);
      imageDataUrl = canvasEl.toDataURL('image/jpeg', 0.85);
    }

    if (!imageDataUrl) {
      showToast('Activez la caméra ou importez un vrai selfie (JPEG, PNG ou WebP) avant d’envoyer.');
      return;
    }

    if (state.selfieStream) {
      state.selfieStream.getTracks().forEach((t) => t.stop());
      state.selfieStream = null;
      document.getElementById('selfie-camera-stage').classList.add('hidden');
    }

    try {
      const res = await apiFetch('/safety/verify-selfie', {
        method: 'POST',
        body: JSON.stringify({
          challengeCode: state.safetyChallenge?.code || 'VICTORY_CHIN',
          imageBase64: imageDataUrl,
        }),
      });
      clearSelfiePreview();
      state.user = res.user;
      if (res.status === 'verified') {
        showToast(`Badge Vérifié 225 activé ! Score : ${res.trustScore}/100`);
      } else if (res.status === 'pending_review') {
        showToast('Selfie reçu ! En attente de validation Bouclier Babi.');
      } else {
        showToast(`Selfie refusé : ${res.aiReason || 'veuillez reprendre un cliché net.'}`);
      }
      loadProfileEditor();
    } catch (err) {
      showToast(err.message);
    }
  });

  // WhatsApp OTP 2-step Phone Verification
  document.getElementById('btn-request-wa-otp').addEventListener('click', async () => {
    try {
      const phone = document.getElementById('input-verify-phone').value.trim();
      const res = await apiFetch('/auth/phone-otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      state.pendingWaPhone = res.phone;
      document.getElementById('input-verify-phone').value = res.phone;
      document.getElementById('wa-otp-verify-block').classList.remove('hidden');
      const hintEl = document.getElementById('wa-otp-dev-hint');
      if (res.simulated && res.devOtpCode) {
        hintEl.textContent = `Mode simulateur local — Code OTP WhatsApp : ${res.devOtpCode}`;
        hintEl.classList.remove('hidden');
      } else {
        hintEl.textContent = `Code envoyé sur WhatsApp au ${res.phone} (valable 5 min).`;
        hintEl.classList.remove('hidden');
      }
      document.getElementById('input-wa-otp-code').value = '';
      document.getElementById('input-wa-otp-code').focus();
      showToast(`Code OTP WhatsApp envoyé vers ${res.phone}.`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('btn-confirm-wa-otp').addEventListener('click', async () => {
    try {
      const phone = state.pendingWaPhone || document.getElementById('input-verify-phone').value.trim();
      const code = document.getElementById('input-wa-otp-code').value.trim();
      const res = await apiFetch('/auth/phone-otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      state.user = res.user;
      document.getElementById('wa-otp-verify-block').classList.add('hidden');
      document.getElementById('input-wa-otp-code').value = '';
      showToast(`Numéro WhatsApp vérifié ! Score de confiance : ${res.trustScore}/100`);
      loadProfileEditor();
    } catch (err) {
      showToast(err.message);
    }
  });

  // Admin Moderation Queue (Bouclier Babi)
  const revokeAdminBlobs = () => {
    state.adminBlobUrls.forEach((u) => URL.revokeObjectURL(u));
    state.adminBlobUrls = [];
  };

  const closeAdminModModal = () => {
    revokeAdminBlobs();
    document.getElementById('admin-mod-modal').classList.remove('active');
  };

  const loadAdminModerationQueue = async () => {
    const secret = document.getElementById('admin-secret-input').value.trim();
    const statusFilter = document.getElementById('admin-status-filter').value;
    const statusMsg = document.getElementById('admin-mod-status-msg');
    const listEl = document.getElementById('admin-mod-queue-list');
    if (!secret) {
      statusMsg.textContent = 'Veuillez saisir la clé X-Admin-Secret.';
      return;
    }
    revokeAdminBlobs();
    statusMsg.textContent = 'Chargement de la file Bouclier Babi...';
    try {
      const res = await apiFetch(`/safety/admin/verifications?status=${encodeURIComponent(statusFilter)}`, {
        headers: { 'X-Admin-Secret': secret },
      });
      const items = res.verifications || [];
      statusMsg.textContent = items.length
        ? `${items.length} demande(s) dans la vue « ${statusFilter} ».`
        : 'Aucune demande dans cette file.';

      const statusLabels = {
        pending_review: 'En attente',
        verified: 'Approuvé ✓',
        rejected: 'Refusé',
      };
      listEl.innerHTML = items
        .map(
          (v) => `
          <article class="admin-mod-card" data-ver-id="${escapeHtml(v.id)}">
            <div class="admin-mod-photos">
              <div class="admin-photo-slot">
                <span class="small muted-text">Profil</span>
                <img src="${escapeHtml(v.userAvatarUrl)}" alt="${escapeHtml(v.userName)}" />
              </div>
              <div class="admin-photo-slot">
                <span class="small muted-text">Selfie défi</span>
                <img class="admin-private-selfie" data-ver-id="${escapeHtml(v.id)}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E" alt="Selfie privé" />
              </div>
            </div>
            <div class="admin-mod-info">
              <div class="card-meta-line">
                <strong>${escapeHtml(v.userName)}, ${v.userAge}</strong>
                <span class="status-chip ${v.status === 'verified' ? '' : 'pending-chip'}">${escapeHtml(statusLabels[v.status] || v.status)}</span>
              </div>
              <p class="small muted-text">${escapeHtml(v.userCommune)} • Défi : ${escapeHtml(v.challengeLabel)}</p>
              <p class="small">${escapeHtml(v.aiReason || 'En attente de revue humaine.')}</p>
              ${
                v.status !== 'verified'
                  ? `<div class="admin-mod-actions">
                       <button type="button" class="btn-primary btn-admin-decision" data-ver-id="${escapeHtml(v.id)}" data-decision="verified">Approuver 225 ✓</button>
                       <button type="button" class="btn-secondary btn-admin-decision" data-ver-id="${escapeHtml(v.id)}" data-decision="rejected">Refuser</button>
                     </div>`
                  : ''
              }
            </div>
          </article>
        `
        )
        .join('');

      // Fetch private selfie blobs using X-Admin-Secret header
      listEl.querySelectorAll('.admin-private-selfie').forEach(async (imgEl) => {
        const verId = imgEl.dataset.verId;
        try {
          const resp = await fetch(`/api/v1/safety/admin/verifications/${encodeURIComponent(verId)}/image`, {
            headers: { 'X-Admin-Secret': secret },
          });
          if (!resp.ok) return;
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          state.adminBlobUrls.push(url);
          imgEl.src = url;
        } catch {
          // Ignore unavailable image
        }
      });

      listEl.querySelectorAll('.btn-admin-decision').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const verId = btn.dataset.verId;
          const decision = btn.dataset.decision;
          try {
            await apiFetch(`/safety/admin/verifications/${encodeURIComponent(verId)}/review`, {
              method: 'POST',
              headers: { 'X-Admin-Secret': secret },
              body: JSON.stringify({
                decision,
                note: decision === 'verified' ? 'Validé par modération Bouclier Babi' : 'Geste ou visage non conforme',
              }),
            });
            showToast(decision === 'verified' ? 'Selfie 225 approuvé !' : 'Selfie refusé.');
            await loadAdminModerationQueue();
            if (state.activeView === 'profile') loadProfileEditor();
          } catch (err) {
            showToast(err.message);
          }
        });
      });
    } catch (err) {
      statusMsg.textContent = err.message;
      listEl.innerHTML = '';
    }
  };

  document.getElementById('btn-open-admin-mod').addEventListener('click', () => {
    document.getElementById('admin-mod-modal').classList.add('active');
  });
  document.getElementById('btn-close-admin-mod').addEventListener('click', closeAdminModModal);
  document.getElementById('btn-admin-load-queue').addEventListener('click', loadAdminModerationQueue);
  document.getElementById('admin-status-filter').addEventListener('change', () => {
    if (document.getElementById('admin-secret-input').value.trim()) {
      loadAdminModerationQueue();
    }
  });

  const bioVoiceBtn = document.getElementById('btn-record-bio-voice');
  bioVoiceBtn.addEventListener('click', async () => {
    if (state.activeRecorder) {
      const clip = await state.activeRecorder.stop();
      state.activeRecorder = null;
      bioVoiceBtn.innerHTML = `${iconSvg('mic', 'ak-ico-sm')}<span>Enregistrer ma voix</span>`;
      const res = await apiFetch('/profiles/me/voice', { method: 'POST', body: JSON.stringify(clip) });
      state.user = res.user;
      showToast('Bio vocale enregistrée !');
      loadProfileEditor();
      return;
    }
    try {
      state.activeRecorder = await recordMicrophoneClip();
      bioVoiceBtn.textContent = 'Terminer l’enregistrement';
    } catch {
      showToast('Micro indisponible — utilisez "Tester avec audio démo".');
    }
  });

  document.getElementById('btn-demo-bio-voice').addEventListener('click', async () => {
    const clip = generateDemoVoiceBase64();
    const res = await apiFetch('/profiles/me/voice', { method: 'POST', body: JSON.stringify(clip) });
    state.user = res.user;
    showToast('Bio vocale mise à jour !');
    loadProfileEditor();
  });

  document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const quiz = {};
      document.querySelectorAll('[data-quiz-key]').forEach((sel) => {
        quiz[sel.dataset.quizKey] = sel.value;
      });
      const commune = document.getElementById('edit-commune').value;
      const city = resolveCityFromCommune(commune);
      const tags = document
        .getElementById('edit-tags')
        .value.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const avatarUrlVal = document.getElementById('edit-avatar-url').value.trim();

      const payload = {
        name: document.getElementById('edit-name').value,
        age: Number(document.getElementById('edit-age').value),
        commune,
        city,
        intention: document.getElementById('edit-intention').value,
        profession: document.getElementById('edit-profession').value,
        lookingFor: document.getElementById('edit-looking').value,
        bio: document.getElementById('edit-bio').value,
        secretPrompt: document.getElementById('edit-secret').value,
        tags,
        vraiBabi: quiz,
      };
      if (avatarUrlVal) payload.avatarUrl = avatarUrlVal;

      const res = await apiFetch('/profiles/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      state.user = res.user;

      const pCity = document.getElementById('edit-passport-city').value;
      const pArrival = document.getElementById('edit-passport-arrival').value;
      const pDeparture = document.getElementById('edit-passport-departure').value;
      if (
        pCity !== (state.user.passportTargetCity || '') ||
        pArrival !== (state.user.passportArrivalDate || '') ||
        pDeparture !== (state.user.passportDepartureDate || '')
      ) {
        const passRes = await apiFetch('/profiles/me/passport', {
          method: 'POST',
          body: JSON.stringify({
            active: Boolean(pCity),
            targetCity: pCity,
            arrivalDate: pArrival,
            departureDate: pDeparture,
          }),
        });
        state.user = passRes.user;
      }

      showToast('Profil et quiz Vrai Babi enregistrés !');
      loadProfileEditor();
    } catch (err) {
      showToast(err.message);
    }
  });

  if (getToken()) {
    bootstrapSession().catch(() => {
      setToken('');
    });
  }
});
