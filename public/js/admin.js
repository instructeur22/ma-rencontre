import { hydrateStaticIcons } from './icons.js';

const ADMIN_SECRET_KEY = 'akwaba_admin_mod_secret_session';

const adminState = {
  secret: sessionStorage.getItem(ADMIN_SECRET_KEY) || '',
  activeTab: 'selfies',
  blobUrls: [],
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
  requestAnimationFrame(() => item.classList.add('visible'));
  setTimeout(() => {
    item.classList.remove('visible');
    setTimeout(() => item.remove(), 220);
  }, 2800);
}

function revokeBlobs() {
  adminState.blobUrls.forEach((u) => URL.revokeObjectURL(u));
  adminState.blobUrls = [];
}

async function adminFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Secret': adminState.secret,
    ...(options.headers || {}),
  };
  const res = await fetch(`/api/v1${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const err = new Error(json?.error?.message || `Erreur HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json.data !== undefined ? json.data : json;
}

function switchAdminTab(tab) {
  adminState.activeTab = tab;
  const selfiesBtn = document.getElementById('tab-admin-selfies');
  const reportsBtn = document.getElementById('tab-admin-reports');
  selfiesBtn.classList.toggle('active', tab === 'selfies');
  reportsBtn.classList.toggle('active', tab === 'reports');
  selfiesBtn.setAttribute('aria-selected', String(tab === 'selfies'));
  reportsBtn.setAttribute('aria-selected', String(tab === 'reports'));

  document.getElementById('admin-mod-queue-list').classList.toggle('hidden', tab !== 'selfies');
  document.getElementById('admin-reports-list').classList.toggle('hidden', tab !== 'reports');
}

async function loadModerationData() {
  const statusFilter = document.getElementById('admin-status-filter').value;
  const statusMsg = document.getElementById('admin-mod-status-msg');
  const queueList = document.getElementById('admin-mod-queue-list');
  const reportsList = document.getElementById('admin-reports-list');

  if (!adminState.secret) {
    statusMsg.textContent = 'Veuillez saisir votre clé X-Admin-Secret.';
    return;
  }

  const btn = document.getElementById('btn-admin-load-queue');
  btn.disabled = true;
  revokeBlobs();
  statusMsg.textContent = 'Chargement de la console Bouclier Babi...';

  try {
    const [verifRes, reportsRes] = await Promise.all([
      adminFetch(`/safety/admin/verifications?status=${encodeURIComponent(statusFilter)}`),
      adminFetch('/safety/admin/reports'),
    ]);

    sessionStorage.setItem(ADMIN_SECRET_KEY, adminState.secret);
    document.getElementById('admin-workspace').classList.remove('hidden');
    document.getElementById('btn-admin-lock').classList.remove('hidden');

    const items = verifRes.verifications || [];
    const reports = reportsRes.reports || [];
    document.getElementById('admin-selfies-count').textContent = String(items.length);
    document.getElementById('admin-reports-count').textContent = String(reports.length);

    statusMsg.textContent = items.length
      ? `${items.length} demande(s) dans la vue « ${statusFilter} » • ${reports.length} signalement(s) enregistrés.`
      : `Aucune demande dans la vue « ${statusFilter} » • ${reports.length} signalement(s).`;

    const statusLabels = {
      pending_review: 'En attente',
      verified: 'Approuvé ✓',
      rejected: 'Refusé',
    };

    queueList.innerHTML = items.length
      ? items
          .map(
            (v) => `
          <article class="admin-mod-card surface-card" data-ver-id="${escapeHtml(v.id)}">
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
          .join('')
      : '<p class="muted-text">Aucune demande de vérification Selfie 225 dans cette vue.</p>';

    queueList.querySelectorAll('.admin-private-selfie').forEach(async (imgEl) => {
      const verId = imgEl.dataset.verId;
      try {
        const resp = await fetch(`/api/v1/safety/admin/verifications/${encodeURIComponent(verId)}/image`, {
          headers: { 'X-Admin-Secret': adminState.secret },
        });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        adminState.blobUrls.push(url);
        imgEl.src = url;
      } catch {
        // Ignore unavailable preview
      }
    });

    queueList.querySelectorAll('.btn-admin-decision').forEach((decBtn) => {
      decBtn.addEventListener('click', async () => {
        decBtn.disabled = true;
        const verId = decBtn.dataset.verId;
        const decision = decBtn.dataset.decision;
        try {
          await adminFetch(`/safety/admin/verifications/${encodeURIComponent(verId)}/review`, {
            method: 'POST',
            body: JSON.stringify({
              decision,
              note: decision === 'verified' ? 'Validé par modération Bouclier Babi' : 'Geste ou visage non conforme',
            }),
          });
          showToast(decision === 'verified' ? 'Selfie 225 approuvé !' : 'Selfie refusé.');
          await loadModerationData();
        } catch (err) {
          showToast(err.message);
          decBtn.disabled = false;
        }
      });
    });

    reportsList.innerHTML = reports.length
      ? reports
          .map(
            (r) => `
          <article class="admin-mod-card surface-card">
            <div class="admin-mod-photos" style="grid-template-columns:1fr;">
              <div class="admin-photo-slot">
                <span class="small muted-text">Profil signalé</span>
                <img src="${escapeHtml(r.targetAvatarUrl)}" alt="${escapeHtml(r.targetName)}" />
              </div>
            </div>
            <div class="admin-mod-info">
              <div class="card-meta-line">
                <strong>${escapeHtml(r.targetName)}, ${r.targetAge} (${escapeHtml(r.targetCommune)})</strong>
                <span class="status-chip pending-chip">${r.totalReports} signalement(s) • Confiance ${r.targetTrustScore}/100</span>
              </div>
              <p class="small"><strong>Signalé par :</strong> ${escapeHtml(r.reporterName)} • <strong>Motif :</strong> ${escapeHtml(r.reason)}</p>
              <div class="admin-mod-actions">
                <button type="button" class="btn-danger btn-ban-user" data-user-id="${escapeHtml(r.targetId)}" data-user-name="${escapeHtml(r.targetName)}">
                  Bannir &amp; purger le compte
                </button>
              </div>
            </div>
          </article>
        `
          )
          .join('')
      : '<p class="muted-text">Aucun signalement membre à traiter.</p>';

    reportsList.querySelectorAll('.btn-ban-user').forEach((banBtn) => {
      banBtn.addEventListener('click', async () => {
        banBtn.disabled = true;
        try {
          await adminFetch(`/safety/admin/users/${encodeURIComponent(banBtn.dataset.userId)}`, {
            method: 'DELETE',
          });
          showToast(`Compte ${banBtn.dataset.userName} banni et purgé.`);
          await loadModerationData();
        } catch (err) {
          showToast(err.message);
          banBtn.disabled = false;
        }
      });
    });
  } catch (err) {
    if (err.status === 401 || err.status === 429) {
      sessionStorage.removeItem(ADMIN_SECRET_KEY);
      document.getElementById('admin-workspace').classList.add('hidden');
    }
    statusMsg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateStaticIcons(document);

  const secretInput = document.getElementById('admin-secret-input');
  if (adminState.secret) {
    secretInput.value = adminState.secret;
    loadModerationData();
  }

  document.getElementById('admin-unlock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    adminState.secret = secretInput.value.trim();
    loadModerationData();
  });

  document.getElementById('admin-status-filter').addEventListener('change', () => {
    if (adminState.secret) loadModerationData();
  });

  document.getElementById('tab-admin-selfies').addEventListener('click', () => switchAdminTab('selfies'));
  document.getElementById('tab-admin-reports').addEventListener('click', () => switchAdminTab('reports'));

  document.getElementById('btn-admin-purge-demo').addEventListener('click', async () => {
    const confirmed = window.confirm(
      'Purger tous les profils démo (@akwaba.ci), leurs matchs, messages, vocaux et réservations ? Les lieux Safe Date et les comptes membres réels seront conservés.'
    );
    if (!confirmed) return;
    const purgeBtn = document.getElementById('btn-admin-purge-demo');
    purgeBtn.disabled = true;
    try {
      const res = await adminFetch('/safety/admin/purge-demo', { method: 'POST' });
      showToast(`Purge effectuée : ${res.purgedUsers} compte(s) démo supprimé(s).`);
      await loadModerationData();
    } catch (err) {
      showToast(err.message);
    } finally {
      purgeBtn.disabled = false;
    }
  });

  document.getElementById('btn-admin-lock').addEventListener('click', () => {
    adminState.secret = '';
    sessionStorage.removeItem(ADMIN_SECRET_KEY);
    secretInput.value = '';
    revokeBlobs();
    document.getElementById('admin-workspace').classList.add('hidden');
    document.getElementById('btn-admin-lock').classList.add('hidden');
    document.getElementById('admin-mod-status-msg').textContent = 'Console verrouillée.';
  });
});
