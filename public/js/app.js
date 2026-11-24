import { apiFetch, connectRealtimeSocket, getToken, setToken } from './api.js';
import {
  bindVoicePlayers,
  generateDemoVoiceBase64,
  recordMicrophoneClip,
  renderVoicePlayerHtml,
} from './audio.js';

const state = {
  user: null,
  meta: null,
  catalog: null,
  discoverProfiles: [],
  discoverIndex: 0,
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
  gpContext: {
    mode: 'store', // 'store' or 'booking'
    itemCode: null,
    itemTitle: '',
    amountXof: 0,
    spotId: null,
    selectedMethod: 'wave',
    activeReference: null,
  },
  activeRecorder: null,
  selfieStream: null,
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  setTimeout(() => item.remove(), 2600);
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

function updateTopbarUser() {
  const u = state.user;
  if (!u) return;
  document.getElementById('header-cauris').textContent = u.caurisBalance;
  document.getElementById('header-commune-pill').textContent = u.passportActive && u.passportTargetCity
    ? `✈ Passeport : ${u.passportTargetCity}`
    : u.commune;

  const incogBtn = document.getElementById('btn-header-incognito');
  incogBtn.textContent = u.incognito ? 'Incognito' : 'Visible';
  incogBtn.classList.toggle('incognito-on', Boolean(u.incognito));

  document.getElementById('nav-likes-count').textContent =
    state.matches.length + state.admirersData.admirers.length;
  document.getElementById('nav-chat-count').textContent = state.matches.length;
}

function switchView(viewName) {
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
}

function handleRealtimeEvent(evt) {
  if (evt.type === 'message') {
    if (state.activeView === 'chat' && evt.matchId === state.activeMatchId) {
      loadConversation(state.activeMatchId);
    } else {
      showToast('Nouveau message reçu dans votre Salon Privé');
      refreshCounts();
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
    passportEl.textContent = `Actif vers ${state.user.passportTargetCity} (${state.user.passportArrivalDate || 'Dates flexibles'})`;
  } else {
    passportEl.textContent = 'Indiquez vos dates de venue à Abidjan pour matcher avant le vol.';
  }

  renderDiscoverCard();
}

function renderDiscoverCard() {
  const host = document.getElementById('discover-card-host');
  const insights = document.getElementById('discover-insights-col');

  if (state.discoverProfiles.length === 0 || state.discoverIndex >= state.discoverProfiles.length) {
    host.innerHTML = `
      <div class="surface-card panel-pad" style="height:550px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:0.85rem;">
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
  const score = p.compatibility?.score || 82;
  const reasons = p.compatibility?.reasons || [];

  host.innerHTML = `
    <article id="active-hero-card" class="profile-hero-card">
      <img class="hero-card-img" src="${escapeHtml(p.avatarUrl)}" alt="${escapeHtml(p.name)}" />
      <div class="hero-card-scrim"></div>
      <div class="hero-top-row">
        <span class="verified-badge">
          ${p.verified225 ? '✓ Vérifié 225' : 'Membre'} • Confiance ${p.trustScore}/100
        </span>
        <span class="compat-pill">${score}% Alchimie</span>
      </div>
      <div class="hero-card-body">
        <h3 class="hero-name">${escapeHtml(p.name)}, ${p.age}</h3>
        <p class="hero-loc">
          ${escapeHtml(p.commune)} • ${escapeHtml(p.profession || p.city)}
          ${p.passportActive && p.passportTargetCity ? ` • ✈ Bientôt à ${escapeHtml(p.passportTargetCity)}` : ''}
        </p>
        <span class="hero-intention-tag">${escapeHtml(p.intention)}</span>
        <p class="hero-bio">${escapeHtml(p.bio)}</p>
        ${renderVoicePlayerHtml(p.voiceNoteUrl, p.voiceDurationSec, false, `Voix de ${p.name}`)}
        <div class="tag-row">
          ${(p.tags || []).slice(0, 4).map((t) => `<span class="mini-tag">#${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    </article>
  `;

  bindVoicePlayers(host);

  const quiz = p.vraiBabi || {};
  insights.innerHTML = `
    <div class="insight-block">
      <div class="panel-title-row">
        <h3>Pourquoi vous matchez (${score}%)</h3>
      </div>
      <ul class="reason-list">
        ${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}
      </ul>
    </div>

    <div class="insight-block">
      <p class="eyebrow">Envie du soir</p>
      <p style="font-weight:600;font-size:0.9rem;">${escapeHtml(p.tonightMood || 'Disponible pour échanger')}</p>
    </div>

    ${
      p.secretPrompt
        ? `<div class="insight-block">
            <p class="eyebrow">Ce qui me fait craquer</p>
            <div class="secret-quote">"${escapeHtml(p.secretPrompt)}"</div>
          </div>`
        : ''
    }

    <div class="insight-block">
      <p class="eyebrow">Profil Vrai Babi</p>
      <div class="quiz-mini-grid">
        <div class="quiz-mini-cell"><span>Plat</span>${escapeHtml(quiz.dish || 'À découvrir')}</div>
        <div class="quiz-mini-cell"><span>Musique</span>${escapeHtml(quiz.music || 'À découvrir')}</div>
        <div class="quiz-mini-cell"><span>Sortie</span>${escapeHtml(quiz.outing || 'À découvrir')}</div>
        <div class="quiz-mini-cell"><span>Vision</span>${escapeHtml(quiz.family_vision || 'À découvrir')}</div>
      </div>
    </div>

    <div class="insight-block">
      <p class="eyebrow">Brise-glace direct (100 Cauris)</p>
      <button class="icebreaker-btn" data-quick-dm="Salut ${escapeHtml(p.name)} ! Votre profil à ${escapeHtml(p.commune)} m'a tout de suite parlé. On discute ?">
        "Salut ${escapeHtml(p.name)} ! Votre profil à ${escapeHtml(p.commune)} m'a parlé..."
      </button>
      <button class="icebreaker-btn" data-quick-dm="Team ${escapeHtml(quiz.dish || 'Abidjan')} ici aussi ! Quand est-ce qu'on teste un bon spot Safe Date ?">
        "Team ${escapeHtml(quiz.dish || 'Abidjan')} ici aussi ! On teste un spot Safe Date ?"
      </button>
    </div>
  `;

  insights.querySelectorAll('.icebreaker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openDirectMessageModal(p, btn.dataset.quickDm);
    });
  });
}

async function performSwipe(action) {
  const p = state.discoverProfiles[state.discoverIndex];
  if (!p) return;

  const card = document.getElementById('active-hero-card');
  if (card) {
    if (action === 'pass') card.classList.add('anim-left');
    if (action === 'like') card.classList.add('anim-right');
    if (action === 'super_like') card.classList.add('anim-up');
  }

  try {
    const res = await apiFetch('/swipes', {
      method: 'POST',
      body: JSON.stringify({ targetId: p.id, action }),
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
        showToast(`Super Coup de Cœur envoyé à ${p.name} ★`);
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
    const matchOpt = [...moodSel.options].find((o) => o.value === state.user.tonightMood);
    if (matchOpt) moodSel.value = state.user.tonightMood;
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
        </div>
        <div class="card-inner-pad">
          <div class="card-meta-line">
            <strong>${escapeHtml(p.name)}, ${p.age}</strong>
            <span>${p.compatibility?.score || 85}% alchimie</span>
          </div>
          <p class="small" style="color:var(--terracotta-deep);font-weight:600;">${escapeHtml(p.tonightMood)}</p>
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
              <span>${a.action === 'super_like' ? '★ Super Cœur' : '♥ A aimé'}</span>
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
            <span class="small muted-text">${m.compatibilityScore}%</span>
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
  drawer.innerHTML = gifts
    .map(
      (g) => `
      <button class="gift-pill-btn" data-gift-code="${escapeHtml(g.code)}" type="button">
        ${g.emoji} ${escapeHtml(g.name)} (${g.costCauris} 🐚)
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

async function loadConversation(matchId) {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) return;

  const header = document.getElementById('chat-room-header');
  header.innerHTML = `
    <div style="display:flex;align-items:center;gap:0.75rem;">
      <img src="${escapeHtml(match.partner.avatarUrl)}" alt="${escapeHtml(match.partner.name)}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" />
      <div>
        <strong>${escapeHtml(match.partner.name)}, ${match.partner.age}</strong>
        <p class="small muted-text">${escapeHtml(match.partner.commune)} • ${match.partner.verified225 ? '✓ Vérifié 225' : 'Membre'}</p>
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

  bindVoicePlayers(stream);
  stream.scrollTop = stream.scrollHeight;
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
              ${t.tx_type === 'credit' ? '+' : '-'}${t.amount_cauris} 🐚
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
async function loadProfileEditor() {
  const [meRes, safetyRes] = await Promise.all([
    apiFetch('/auth/me'),
    apiFetch('/safety/challenge'),
  ]);
  state.user = meRes.user;
  state.meta = meRes.meta;
  state.safetyChallenge = safetyRes.challenge;
  updateTopbarUser();

  const u = state.user;
  document.getElementById('me-preview-photo').src = u.avatarUrl;
  document.getElementById('me-preview-name').textContent = `${u.name}, ${u.age}`;
  document.getElementById('me-preview-meta').textContent = `${u.commune} • ${u.intention}`;
  document.getElementById('me-badges-row').innerHTML = `
    ${u.verified225 ? '<span class="status-chip">✓ Vérifié 225</span>' : '<span class="status-chip" style="background:var(--gold-soft);color:#6B480C;">Non vérifié</span>'}
    ${u.phoneVerified ? '<span class="status-chip">Tél vérifié</span>' : ''}
    ${u.subscriptionTier !== 'free' ? `<span class="status-chip">${escapeHtml(u.subscriptionTier)}</span>` : ''}
  `;

  document.getElementById('me-trust-score').textContent = `${u.trustScore}/100`;
  document.getElementById('me-trust-fill').style.width = `${u.trustScore}%`;
  document.getElementById('me-referral-code').textContent = u.referralCode;
  document.getElementById('safety-challenge-label').textContent =
    `Défi du jour : "${safetyRes.challenge.label}" — ${safetyRes.challenge.tip}`;
  document.getElementById('input-verify-phone').value = u.phone || '';

  const voiceHost = document.getElementById('me-voice-player-host');
  voiceHost.innerHTML = u.voiceNoteUrl
    ? renderVoicePlayerHtml(u.voiceNoteUrl, u.voiceDurationSec, true, 'Ma bio vocale')
    : '<p class="muted-text small">Aucune note vocale enregistrée.</p>';
  bindVoicePlayers(voiceHost);

  document.getElementById('edit-name').value = u.name;
  document.getElementById('edit-age').value = u.age;
  document.getElementById('edit-commune').value = u.commune;
  document.getElementById('edit-intention').value = u.intention;
  document.getElementById('edit-profession').value = u.profession || '';
  document.getElementById('edit-looking').value = u.lookingFor;
  document.getElementById('edit-bio').value = u.bio;
  document.getElementById('edit-secret').value = u.secretPrompt || '';
  document.getElementById('edit-tags').value = (u.tags || []).join(', ');
  document.getElementById('edit-passport-city').value = u.passportTargetCity || '';
  document.getElementById('edit-passport-arrival').value = u.passportArrivalDate || '';

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
  // Service Worker registration
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

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
      const city = commune.includes('•') ? (commune.startsWith('Paris') ? 'Paris' : 'Abidjan') : commune;
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

  // Chat Controls
  document.getElementById('chat-send-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.activeMatchId) return;
    const input = document.getElementById('chat-text-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
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
      const input = document.getElementById('chat-text-input');
      input.value = btn.dataset.ice;
      input.focus();
    });
  });

  document.getElementById('btn-toggle-gifts').addEventListener('click', () => {
    document.getElementById('chat-gifts-drawer').classList.toggle('hidden');
  });

  document.getElementById('btn-invite-safedate').addEventListener('click', async () => {
    if (!state.activeMatchId) return;
    const spotsRes = await apiFetch('/dates/spots');
    const firstSpot = spotsRes.spots?.[0];
    if (!firstSpot) return;
    await apiFetch(`/chats/${state.activeMatchId}/date-invite`, {
      method: 'POST',
      body: JSON.stringify({ spotId: firstSpot.id, proposedDate: 'Samedi à 17h30' }),
    });
    await loadConversation(state.activeMatchId);
    showToast(`Invitation Safe Date envoyée (${firstSpot.name}) !`);
  });

  const chatVoiceBtn = document.getElementById('btn-record-chat-voice');
  chatVoiceBtn.addEventListener('click', async () => {
    if (!state.activeMatchId) return;
    if (state.activeRecorder) {
      const clip = await state.activeRecorder.stop();
      state.activeRecorder = null;
      chatVoiceBtn.classList.remove('recording');
      chatVoiceBtn.textContent = '🎙️ Vocal';
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
      chatVoiceBtn.textContent = '⏹ Stop';
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
      document.getElementById('gp-checkout-status-msg').textContent = checkoutData.simulated
        ? `Session Sandbox GeniusPay prête (${state.gpContext.selectedMethod}). Validez ci-dessous pour déclencher le Webhook HMAC-SHA256.`
        : 'Redirection vers la page de checkout GeniusPay...';

      const extLink = document.getElementById('gp-external-link');
      if (!checkoutData.simulated && checkoutData.checkoutUrl) {
        extLink.href = checkoutData.checkoutUrl;
        extLink.classList.remove('hidden');
      } else {
        extLink.classList.add('hidden');
      }

      document.getElementById('gp-step-select').classList.add('hidden');
      document.getElementById('gp-step-checkout').classList.remove('hidden');
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
      showToast(`Paiement GeniusPay validé ! ${res.fulfillment?.grantedSummary || ''}`);
      if (state.activeView === 'store') loadStoreAndWallet();
    } else {
      showToast('Paiement annulé / échoué.');
    }
  };

  document.getElementById('btn-gp-confirm-sandbox').addEventListener('click', () => completeSandboxPayment('success'));
  document.getElementById('btn-gp-fail-sandbox').addEventListener('click', () => completeSandboxPayment('failed'));

  // Profile & Bouclier Babi
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

  document.getElementById('btn-start-selfie-cam').addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      state.selfieStream = stream;
      const stage = document.getElementById('selfie-camera-stage');
      stage.classList.remove('hidden');
      document.getElementById('selfie-video').srcObject = stream;
    } catch {
      showToast('Caméra indisponible — vous pouvez valider le défi en mode démo.');
    }
  });

  document.getElementById('btn-submit-selfie').addEventListener('click', async () => {
    if (state.selfieStream) {
      state.selfieStream.getTracks().forEach((t) => t.stop());
      state.selfieStream = null;
      document.getElementById('selfie-camera-stage').classList.add('hidden');
    }
    const res = await apiFetch('/safety/verify-selfie', {
      method: 'POST',
      body: JSON.stringify({
        challengeCode: state.safetyChallenge?.code || 'VICTORY_CHIN',
        selfieSnapshot: 'verified_web_capture',
      }),
    });
    state.user = res.user;
    showToast(`Badge Vérifié 225 activé ! Score : ${res.trustScore}/100`);
    loadProfileEditor();
  });

  document.getElementById('btn-verify-phone').addEventListener('click', async () => {
    try {
      const phone = document.getElementById('input-verify-phone').value;
      const res = await apiFetch('/auth/phone-verify', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      state.user = res.user;
      showToast(`Numéro vérifié ! Score de confiance : ${res.trustScore}/100`);
      loadProfileEditor();
    } catch (err) {
      showToast(err.message);
    }
  });

  const bioVoiceBtn = document.getElementById('btn-record-bio-voice');
  bioVoiceBtn.addEventListener('click', async () => {
    if (state.activeRecorder) {
      const clip = await state.activeRecorder.stop();
      state.activeRecorder = null;
      bioVoiceBtn.textContent = '🎙️ Enregistrer ma voix';
      const res = await apiFetch('/profiles/me/voice', { method: 'POST', body: JSON.stringify(clip) });
      state.user = res.user;
      showToast('Bio vocale enregistrée !');
      loadProfileEditor();
      return;
    }
    try {
      state.activeRecorder = await recordMicrophoneClip();
      bioVoiceBtn.textContent = '⏹ Terminer l’enregistrement';
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
    const quiz = {};
    document.querySelectorAll('[data-quiz-key]').forEach((sel) => {
      quiz[sel.dataset.quizKey] = sel.value;
    });
    const commune = document.getElementById('edit-commune').value;
    const city = commune.includes('•') ? (commune.startsWith('Paris') ? 'Paris' : 'Abidjan') : commune;
    const tags = document
      .getElementById('edit-tags')
      .value.split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await apiFetch('/profiles/me', {
      method: 'PUT',
      body: JSON.stringify({
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
      }),
    });
    state.user = res.user;

    const pCity = document.getElementById('edit-passport-city').value;
    const pArrival = document.getElementById('edit-passport-arrival').value;
    if (pCity !== (state.user.passportTargetCity || '')) {
      try {
        const passRes = await apiFetch('/profiles/me/passport', {
          method: 'POST',
          body: JSON.stringify({ active: Boolean(pCity), targetCity: pCity, arrivalDate: pArrival }),
        });
        state.user = passRes.user;
      } catch (err) {
        showToast(err.message);
      }
    }

    showToast('Profil et quiz Vrai Babi enregistrés !');
    loadProfileEditor();
  });

  // Auto-resume existing session if JWT token is valid
  if (getToken()) {
    bootstrapSession().catch(() => {
      setToken('');
    });
  }
});
