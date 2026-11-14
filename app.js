const DEFAULT_USER = {
  name: "Alex",
  age: 28,
  city: "Paris • Le Marais",
  vibe: "Passion sans filtre",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80",
  bio: "J'aime les regards qui en disent long, les rooftops à minuit et les personnes qui savent exactement ce qu'elles veulent.",
  secret: "Un verre de vin rouge, une playlist R&B tamisée et zéro tabou."
};

const AVATAR_PRESETS = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=700&q=80"
];

const PROFILES = [
  {
    id: "clara",
    name: "Clara",
    age: 26,
    city: "Paris 11e",
    distance: 3,
    online: true,
    heat: 98,
    vibe: "Passion sans filtre",
    tonightMood: "🔥 Alchimie immédiate chez moi ou chez toi",
    photo: "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=80",
    bio: "Danseuse contemporaine et oiseau de nuit. Je déteste la tiédeur : soit ça crépite dès les premières minutes, soit rien.",
    secret: "J'adore quand on prend les devants et qu'on me propose un lieu secret à la dernière minute.",
    tags: ["Sensuelle", "Oiseau de nuit", "Cocktails épicés", "Sans tabou"],
    replies: [
      "Mmmh j'aime bien ton audace... Tu fais quoi dans la prochaine heure ? 🔥",
      "Tu sais comment faire monter la température toi. Dis-m'en plus sur ce qui te tente ce soir 💋",
      "Chiche ! Je commande deux verres, tu me rejoins ou tu préfères qu'on s'éclipse direct ?"
    ]
  },
  {
    id: "maya",
    name: "Maya",
    age: 29,
    city: "Lyon • Confluence",
    distance: 7,
    online: true,
    heat: 95,
    vibe: "Alchimie nocturne",
    tonightMood: "🥂 Verre en bar tamisé",
    photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    bio: "Photographe de mode le jour, épicurienne assumée la nuit. Attirée par les esprits joueurs et les peaux qui brûlent.",
    secret: "Un massage aux huiles chaudes après minuit est mon point faible absolu.",
    tags: ["Artistique", "Jeux de regards", "Massages", "Lingerie fine"],
    replies: [
      "Ton message tombe à pic, je m'ennuyais justement dans mon grand lit... 🌙",
      "J'adore quand il y a du mystère et de la tension. Tu es plutôt dominant ou complice ?",
      "Viens vérifier par toi-même si le feeling est aussi électrique en vrai ⚡"
    ]
  },
  {
    id: "lucas",
    name: "Lucas",
    age: 31,
    city: "Paris • Pigalle",
    distance: 4,
    online: true,
    heat: 96,
    vibe: "Rendez-vous secret",
    tonightMood: "🌙 Virée nocturne improvisée",
    photo: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    bio: "Architecte passionné, regard intense et mains attentives. Ici pour des nuits où on oublie de regarder l'heure.",
    secret: "Les baisers dans le cou dans un ascenseur ou un speakeasy caché.",
    tags: ["Speakeasy", "Intense", "Gentleman rebelle", "Nuit blanche"],
    replies: [
      "Voilà une entrée en matière qui me plaît beaucoup. On se retrouve autour d'un mezcal ? 🥃",
      "La nuit ne fait que commencer... Dis-moi quelle est ta limite et je m'occupe du reste 🔥",
      "J'aime quand les choses vont droit au but. Dis-moi ton quartier."
    ]
  },
  {
    id: "soraya",
    name: "Soraya",
    age: 25,
    city: "Marseille • Vieux-Port",
    distance: 14,
    online: true,
    heat: 99,
    vibe: "Flirt & Tentation",
    tonightMood: "💬 Flirt vocal & jeux de séduction",
    photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80",
    bio: "Tempérament volcanique du sud. Si tu as de la répartie et du charme, tu as déjà fait la moitié du chemin.",
    secret: "Bain de minuit improvisé et défis Action ou Vérité très corsés.",
    tags: ["Volcanique", "Bain de minuit", "Action ou Vérité", "Sud"],
    replies: [
      "Haha j'adore ! Tu commences fort, voyons si tu assumes jusqu'au bout 🔥",
      "Pose-moi ta question la plus indiscrète, je promets de répondre sans mentir 💋",
      "Tu me donnes chaud là... Continue comme ça."
    ]
  },
  {
    id: "elena",
    name: "Elena",
    age: 27,
    city: "Bordeaux • Chartrons",
    distance: 19,
    online: false,
    heat: 93,
    vibe: "Rendez-vous secret",
    tonightMood: "🥂 Verre en bar tamisé",
    photo: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80",
    bio: "Sommelière le jour, tentatrice discrète le soir. J'aime les rencontres feutrées où tout se joue dans les détails.",
    secret: "Déguster un grand cru à l'aveugle les yeux bandés...",
    tags: ["Yeux bandés", "Grand cru", "Sensualité", "Discrétion"],
    replies: [
      "Les yeux bandés, tu me ferais confiance ? 🍷🔥",
      "J'aime les plaisirs lents qui deviennent incontrôlables.",
      "Dis-moi ce qui te fait frissonner en premier chez quelqu'un."
    ]
  },
  {
    id: "enzo",
    name: "Enzo",
    age: 28,
    city: "Nice • Promenade",
    distance: 28,
    online: true,
    heat: 94,
    vibe: "Passion sans filtre",
    tonightMood: "🔥 Alchimie immédiate chez moi ou chez toi",
    photo: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=900&q=80",
    bio: "Mixologue & DJ. Je crée des cocktails sur-mesure selon ton humeur de la nuit. Zéro prise de tête, 100% plaisir.",
    secret: "Jacuzzi sur le toit avec vue sur la ville illuminée.",
    tags: ["DJ & Rooftop", "Jacuzzi", "Spontané", "Alchimie"],
    replies: [
      "Le jacuzzi est à 38°C, il ne manque plus que toi 🔥",
      "Dis-moi ton parfum préféré, je te prépare un cocktail qui porte ton nom.",
      "Pas de blabla inutile, j'adore ton énergie !"
    ]
  }
];

// Application State
let state = {
  user: JSON.parse(localStorage.getItem("ardent_user")) || DEFAULT_USER,
  ageVerified: localStorage.getItem("ardent_age_ok") === "true",
  incognito: false,
  vibeFilter: "all",
  maxDistance: 35,
  onlineOnly: false,
  deckIndex: 0,
  likedIds: JSON.parse(localStorage.getItem("ardent_likes")) || ["clara", "maya"],
  activeChatId: "clara",
  chats: JSON.parse(localStorage.getItem("ardent_chats")) || {
    clara: [
      { sender: "them", text: "Coucou toi 🔥 J'ai vu qu'on avait 98% d'alchimie... Tu es libre ce soir ?", time: "22:14" }
    ],
    maya: [
      { sender: "them", text: "Ton profil a attiré mon œil... Plutôt verre tamisé ou nuit blanche ? 🌙", time: "21:48" }
    ]
  }
};

function saveState() {
  localStorage.setItem("ardent_user", JSON.stringify(state.user));
  localStorage.setItem("ardent_likes", JSON.stringify(state.likedIds));
  localStorage.setItem("ardent_chats", JSON.stringify(state.chats));
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3400);
}

//Filtered Profiles for Swipe Deck
function getFilteredProfiles() {
  return PROFILES.filter((p) => {
    if (state.vibeFilter !== "all" && p.vibe !== state.vibeFilter) return false;
    if (p.distance > state.maxDistance) return false;
    if (state.onlineOnly && !p.online) return false;
    return true;
  });
}

// Render Swipe Deck & Details Sidebar
function renderDeck() {
  const container = document.getElementById("swipe-card-container");
  const details = document.getElementById("active-profile-details");
  const list = getFilteredProfiles();

  if (list.length === 0) {
    container.innerHTML = `
      <div class="glass-card" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;">
        <div style="font-size:3rem;margin-bottom:0.8rem;">🔥</div>
        <h3 class="serif-title" style="font-size:1.7rem;margin-bottom:0.5rem;">Aucun profil avec ces filtres</h3>
        <p style="color:var(--text-muted);margin-bottom:1.2rem;">Élargissez la distance ou explorez toutes les intentions du club.</p>
        <button class="btn-primary" onclick="resetFilters()">Réinitialiser les filtres</button>
      </div>
    `;
    details.innerHTML = `<p style="color:var(--text-muted);">Ajustez vos filtres pour découvrir de nouveaux profils.</p>`;
    return;
  }

  if (state.deckIndex >= list.length) {
    state.deckIndex = 0;
  }

  const profile = list[state.deckIndex];

  container.innerHTML = `
    <article class="profile-card" id="current-swipe-card">
      <img class="card-photo" src="${profile.photo}" alt="${profile.name}" />
      <div class="card-gradient"></div>
      <div class="card-top-badges">
        <span class="status-tag">
          <span class="pulse-dot" style="background:${profile.online ? '#22c55e' : '#f59e0b'}"></span>
          ${profile.online ? "En ligne ce soir" : "Actif récemment"}
        </span>
        <span class="heat-score">🔥 ${profile.heat}% d'Alchimie</span>
      </div>
      <div class="card-content">
        <div class="card-title-row">
          <h2 class="card-name">${profile.name}, ${profile.age}</h2>
          <span class="card-distance">📍 ${profile.city} (${profile.distance} km)</span>
        </div>
        <span class="card-vibe-pill">⚡ ${profile.vibe}</span>
        <p class="card-bio">${profile.bio}</p>
        <div class="card-tags">
          ${profile.tags.map((t) => `<span class="mini-tag">#${t}</span>`).join("")}
        </div>
      </div>
    </article>
  `;

  details.innerHTML = `
    <div class="details-section">
      <div class="details-label">🌙 Mood de ${profile.name} ce soir</div>
      <p style="font-size:0.92rem;font-weight:600;">${profile.tonightMood}</p>
    </div>
    <div class="details-section">
      <div class="details-label">🤫 Fantasme / Secret assumé</div>
      <div class="secret-box">"${profile.secret}"</div>
    </div>
    <div class="details-section">
      <div class="details-label">💬 Briser la glace direct</div>
      <button class="quick-flirt-btn" onclick="sendQuickFlirt('${profile.id}', '🔥 Ton secret m\\'intrigue beaucoup ${profile.name}... On en parle en privé ?')">
        🔥 "Ton secret m'intrigue beaucoup..."
      </button>
      <button class="quick-flirt-btn" onclick="sendQuickFlirt('${profile.id}', '🥂 ${profile.tonightMood.slice(2)} ? Dis-moi où et quand.')">
        🥂 "Partant(e) pour ton mood du soir !"
      </button>
      <button class="quick-flirt-btn" onclick="sendQuickFlirt('${profile.id}', '⚡ 98% d\\'alchimie, on vérifie ça autour d\\'un verre ce soir ?')">
        ⚡ "On vérifie notre alchimie ce soir ?"
      </button>
    </div>
  `;
}

function handleSwipe(action) {
  const list = getFilteredProfiles();
  if (!list.length) return;
  const profile = list[state.deckIndex];
  const card = document.getElementById("current-swipe-card");

  if (card) {
    if (action === "pass") card.classList.add("swipe-left");
    if (action === "like") card.classList.add("swipe-right");
    if (action === "crush") card.classList.add("swipe-up");
  }

  setTimeout(() => {
    if (action === "like" || action === "crush") {
      if (!state.likedIds.includes(profile.id)) {
        state.likedIds.push(profile.id);
      }
      if (!state.chats[profile.id]) {
        state.chats[profile.id] = [
          {
            sender: "them",
            text: profile.replies[0],
            time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          }
        ];
      }
      saveState();
      updateBadges();
      openMatchModal(profile, action === "crush");
    } else {
      showToast(`Vous avez passé ${profile.name}`);
    }

    state.deckIndex = (state.deckIndex + 1) % list.length;
    renderDeck();
  }, 280);
}

function openMatchModal(profile, isCrush) {
  const overlay = document.getElementById("match-overlay");
  document.getElementById("match-subtitle").innerHTML = isCrush
    ? `Votre <strong>Coup de Chaud ⚡</strong> a fait fondre <strong>${profile.name}</strong> !`
    : `L'attirance est réciproque avec <strong>${profile.name}</strong> (${profile.heat}% d'alchimie).`;
  document.getElementById("match-user-img").src = state.user.avatar;
  document.getElementById("match-target-img").src = profile.photo;

  document.getElementById("btn-match-chat").onclick = () => {
    overlay.classList.remove("active");
    state.activeChatId = profile.id;
    switchView("chat");
  };

  document.getElementById("btn-match-keep").onclick = () => {
    overlay.classList.remove("active");
  };

  overlay.classList.add("active");
}

window.sendQuickFlirt = function (profileId, messageText) {
  const profile = PROFILES.find((p) => p.id === profileId);
  if (!profile) return;

  if (!state.likedIds.includes(profileId)) {
    state.likedIds.push(profileId);
  }
  if (!state.chats[profileId]) {
    state.chats[profileId] = [];
  }
  const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  state.chats[profileId].push({ sender: "me", text: messageText, time: now });
  saveState();
  updateBadges();

  state.activeChatId = profileId;
  switchView("chat");
  triggerAutoReply(profileId);
};

window.resetFilters = function () {
  state.vibeFilter = "all";
  state.maxDistance = 100;
  state.onlineOnly = false;
  document.getElementById("distance-range").value = 100;
  document.getElementById("distance-val").textContent = "100 km";
  document.getElementById("filter-online-only").checked = false;
  document.querySelectorAll("#filter-vibes .chip").forEach((c) => {
    c.classList.toggle("active", c.dataset.vibe === "all");
  });
  renderDeck();
};

// Render Radar Nocturne
function renderRadar() {
  const grid = document.getElementById("radar-grid");
  grid.innerHTML = PROFILES.map(
    (p) => `
    <div class="grid-card">
      <div class="grid-img-wrap">
        <img src="${p.photo}" alt="${p.name}" />
        <span class="grid-badge-top">
          ${p.online ? "🟢 Disponible ce soir" : "🌙 Actif il y a 20m"} • ${p.distance} km
        </span>
      </div>
      <div class="grid-body">
        <div class="grid-title">
          <h4>${p.name}, ${p.age}</h4>
          <span style="color:var(--primary);font-weight:700;font-size:0.85rem;">🔥 ${p.heat}%</span>
        </div>
        <div class="grid-mood">${p.tonightMood}</div>
        <p class="grid-bio">${p.bio}</p>
        <div class="grid-actions">
          <button class="btn-primary" style="flex:1;padding:0.55rem;" onclick="sendQuickFlirt('${p.id}', 'Salut ${p.name} 🔥 Ton mood du soir me tente énormément !')">
            Inviter ce soir 🔥
          </button>
        </div>
      </div>
    </div>
  `
  ).join("");
}

// Render Likes & Tentations
function renderLikes() {
  const grid = document.getElementById("likes-grid");
  const likedProfiles = PROFILES.filter((p) => state.likedIds.includes(p.id));

  if (likedProfiles.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-muted);">Aucun coup de cœur enregistré pour le moment. Explorez le deck pour matcher !</p>`;
    return;
  }

  grid.innerHTML = likedProfiles
    .map(
      (p) => `
    <div class="grid-card">
      <div class="grid-img-wrap">
        <img src="${p.photo}" alt="${p.name}" />
        <span class="grid-badge-top">💋 Match & Tentation</span>
      </div>
      <div class="grid-body">
        <div class="grid-title">
          <h4>${p.name}, ${p.age}</h4>
          <span style="color:var(--gold);font-weight:700;font-size:0.82rem;">⚡ ${p.vibe}</span>
        </div>
        <p class="grid-bio"><strong>Son secret :</strong> "${p.secret}"</p>
        <div class="grid-actions">
          <button class="btn-primary" style="flex:1;padding:0.55rem;" onclick="openChatWith('${p.id}')">
            Ouvrir le Salon Privé 💬
          </button>
        </div>
      </div>
    </div>
  `
    )
    .join("");
}

window.openChatWith = function (profileId) {
  state.activeChatId = profileId;
  switchView("chat");
};

// Render Chat
function renderChat() {
  const listEl = document.getElementById("chat-list");
  const headerEl = document.getElementById("chat-header");
  const messagesEl = document.getElementById("chat-messages");

  const chatPartnerIds = Object.keys(state.chats);
  if (!chatPartnerIds.includes(state.activeChatId) && chatPartnerIds.length > 0) {
    state.activeChatId = chatPartnerIds[0];
  }

  listEl.innerHTML = chatPartnerIds
    .map((id) => {
      const p = PROFILES.find((item) => item.id === id);
      if (!p) return "";
      const msgs = state.chats[id] || [];
      const last = msgs[msgs.length - 1];
      return `
      <div class="chat-item ${id === state.activeChatId ? "active" : ""}" onclick="selectChat('${id}')">
        <img src="${p.photo}" alt="${p.name}" />
        <div class="chat-item-info">
          <div class="chat-item-name">${p.name}, ${p.age} ${p.online ? "🟢" : ""}</div>
          <div class="chat-item-last">${last ? last.text : "Démarrez la conversation..."}</div>
        </div>
      </div>
    `;
    })
    .join("");

  const partner = PROFILES.find((p) => p.id === state.activeChatId) || PROFILES[0];
  headerEl.innerHTML = `
    <div class="chat-partner">
      <img src="${partner.photo}" alt="${partner.name}" />
      <div>
        <h4 style="font-size:1.05rem;">${partner.name}, ${partner.age}</h4>
        <span style="font-size:0.78rem;color:var(--gold);">${partner.tonightMood}</span>
      </div>
    </div>
    <span class="heat-score">🔥 ${partner.heat}% d'Alchimie</span>
  `;

  const activeMsgs = state.chats[partner.id] || [];
  messagesEl.innerHTML = activeMsgs
    .map(
      (m) => `
    <div class="msg ${m.sender}">
      ${m.text}
      <span class="msg-time">${m.time}</span>
    </div>
  `
    )
    .join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

window.selectChat = function (id) {
  state.activeChatId = id;
  renderChat();
};

function triggerAutoReply(profileId) {
  const partner = PROFILES.find((p) => p.id === profileId);
  if (!partner) return;

  setTimeout(() => {
    const replyPool = partner.replies;
    const randomReply = replyPool[Math.floor(Math.random() * replyPool.length)];
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

    if (!state.chats[profileId]) state.chats[profileId] = [];
    state.chats[profileId].push({
      sender: "them",
      text: randomReply,
      time: now
    });
    saveState();
    if (document.getElementById("view-chat").classList.contains("active")) {
      renderChat();
    } else {
      showToast(`💬 Nouveau message chaud de ${partner.name} !`);
    }
  }, 1300);
}

// Render User Profile Form & Preview
function renderProfileEditor() {
  const u = state.user;
  document.getElementById("my-profile-img").src = u.avatar;
  document.getElementById("preview-name-age").textContent = `${u.name}, ${u.age}`;
  document.getElementById("preview-vibe").textContent = `⚡ ${u.vibe} • 📍 ${u.city}`;
  document.getElementById("preview-bio").textContent = u.bio;

  document.getElementById("input-name").value = u.name;
  document.getElementById("input-age").value = u.age;
  document.getElementById("input-city").value = u.city;
  document.getElementById("input-vibe").value = u.vibe;
  document.getElementById("input-avatar").value = u.avatar;
  document.getElementById("input-bio").value = u.bio;
  document.getElementById("input-secret").value = u.secret;

  const presetsEl = document.getElementById("avatar-presets");
  presetsEl.innerHTML = AVATAR_PRESETS.map(
    (url) => `
    <img src="${url}" class="avatar-preset ${url === u.avatar ? "selected" : ""}" onclick="selectAvatarPreset('${url}')" alt="Avatar" />
  `
  ).join("");
}

window.selectAvatarPreset = function (url) {
  state.user.avatar = url;
  document.getElementById("input-avatar").value = url;
  renderProfileEditor();
};

function updateBadges() {
  document.getElementById("likes-badge").textContent = state.likedIds.length;
  document.getElementById("chat-badge").textContent = Object.keys(state.chats).length;
}

// View Navigation
function switchView(viewName) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === viewName);
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("active");

  if (viewName === "swipe") renderDeck();
  if (viewName === "radar") renderRadar();
  if (viewName === "likes") renderLikes();
  if (viewName === "chat") renderChat();
  if (viewName === "profile") renderProfileEditor();
}

// Initialize Events
document.addEventListener("DOMContentLoaded", () => {
  // Age Gate
  const ageGate = document.getElementById("age-gate");
  if (state.ageVerified) {
    ageGate.classList.remove("active");
  }
  document.getElementById("btn-enter-club").addEventListener("click", () => {
    state.ageVerified = true;
    localStorage.setItem("ardent_age_ok", "true");
    ageGate.classList.remove("active");
    showToast("Bienvenue dans le Club ARDENT 🔥");
  });

  // Nav Tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  // Incognito Mode
  const incogBtn = document.getElementById("btn-incognito");
  incogBtn.addEventListener("click", () => {
    state.incognito = !state.incognito;
    incogBtn.classList.toggle("active", state.incognito);
    incogBtn.querySelector(".incog-label").textContent = state.incognito ? "Incognito" : "Visible";
    showToast(
      state.incognito
        ? "🕶️ Mode Incognito activé : seuls vos likes voient votre profil."
        : "🔥 Profil visible par tous les membres du club."
    );
  });

  // Swipe Controls
  document.getElementById("btn-pass").addEventListener("click", () => handleSwipe("pass"));
  document.getElementById("btn-crush").addEventListener("click", () => handleSwipe("crush"));
  document.getElementById("btn-like").addEventListener("click", () => handleSwipe("like"));

  // Keyboard shortcuts for Swipe view
  document.addEventListener("keydown", (e) => {
    const swipeActive = document.getElementById("view-swipe").classList.contains("active");
    if (!swipeActive || document.getElementById("age-gate").classList.contains("active")) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

    if (e.key === "ArrowLeft") handleSwipe("pass");
    if (e.key === "ArrowRight") handleSwipe("like");
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleSwipe("crush");
    }
  });

  // Filters
  document.querySelectorAll("#filter-vibes .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#filter-vibes .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.vibeFilter = chip.dataset.vibe;
      state.deckIndex = 0;
      renderDeck();
    });
  });

  const distRange = document.getElementById("distance-range");
  distRange.addEventListener("input", () => {
    state.maxDistance = Number(distRange.value);
    document.getElementById("distance-val").textContent = `${state.maxDistance} km`;
    state.deckIndex = 0;
    renderDeck();
  });

  document.getElementById("filter-online-only").addEventListener("change", (e) => {
    state.onlineOnly = e.target.checked;
    state.deckIndex = 0;
    renderDeck();
  });

  document.getElementById("btn-reset-deck").addEventListener("click", () => window.resetFilters());

  // Tonight Mood Selector
  document.getElementById("my-tonight-mood").addEventListener("change", (e) => {
    showToast(`Mood du soir mis à jour : ${e.target.value}`);
  });

  // Chat Form & Icebreakers
  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (!state.chats[state.activeChatId]) state.chats[state.activeChatId] = [];
    state.chats[state.activeChatId].push({ sender: "me", text, time: now });
    input.value = "";
    saveState();
    renderChat();
    triggerAutoReply(state.activeChatId);
  });

  document.querySelectorAll(".ice-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("chat-input");
      input.value = btn.dataset.ice;
      input.focus();
    });
  });

  // Profile Form Submit
  document.getElementById("profile-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.user = {
      name: document.getElementById("input-name").value.trim() || "Alex",
      age: Number(document.getElementById("input-age").value) || 28,
      city: document.getElementById("input-city").value.trim() || "Paris",
      vibe: document.getElementById("input-vibe").value,
      avatar: document.getElementById("input-avatar").value.trim() || DEFAULT_USER.avatar,
      bio: document.getElementById("input-bio").value.trim(),
      secret: document.getElementById("input-secret").value.trim()
    };
    saveState();
    renderProfileEditor();
    const toastEl = document.getElementById("save-toast");
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2500);
    showToast("Profil mis à jour avec succès 🔥");
  });

  // Live Counter Subtle Fluctuation
  setInterval(() => {
    const el = document.getElementById("online-counter");
    const base = 248;
    const delta = Math.floor(Math.random() * 11) - 4;
    el.textContent = base + delta;
  }, 5000);

  // Initial Render
  updateBadges();
  renderDeck();
});
