import crypto from 'node:crypto';
import { runInTransaction } from '../db/database.js';
import { GENIUSPAY_METHODS } from './geniusPayService.js';
import { parseJsonSafe } from './matchingService.js';

export const STORE_CATALOG = {
  subscriptions: [
    {
      code: 'djo_3d',
      name: 'Pass Djô • 3 Jours',
      priceXof: 1000,
      durationDays: 3,
      caurisBonus: 120,
      tagline: 'Idéal pour un week-end à Abidjan ou Assinie',
      perks: [
        'Likes illimités pendant 72h',
        'Filtre précis par Commune d’Abidjan',
        '120 Cauris offerts (1 DM avant match)',
      ],
    },
    {
      code: 'babi_gold',
      name: 'Pass Babi Gold • 1 Mois',
      priceXof: 3500,
      durationDays: 30,
      caurisBonus: 500,
      popular: true,
      tagline: 'Le meilleur rapport liberté / prix en Côte d’Ivoire',
      perks: [
        'Voir qui a craqué pour ton profil (Admirateurs)',
        'Mode Incognito illimité (discrétion totale)',
        '500 Cauris offerts + 1 Boost Tête d’affiche/semaine',
      ],
    },
    {
      code: 'diaspora_vip',
      name: 'Pass Diaspora VIP • 1 Mois',
      priceXof: 9500,
      durationDays: 30,
      caurisBonus: 1500,
      tagline: 'Connecte Paris, Montréal, Bruxelles & Abidjan sans limites',
      perks: [
        'Passeport Babi multi-villes + dates de retour',
        '1 500 Cauris offerts + Priorité profils Vérifiés 225',
        'Accès VIP prioritaire aux Soirées Safe Date',
      ],
    },
  ],
  caurisPacks: [
    {
      code: 'cauris_250',
      name: 'Petit Panier • 250 Cauris',
      priceXof: 500,
      caurisAmount: 250,
      tagline: 'Pour 2 DM directs ou 1 Boost 24h + 1 cadeau',
    },
    {
      code: 'cauris_850',
      name: 'Coffre Babi • 850 Cauris',
      priceXof: 1500,
      caurisAmount: 850,
      popular: true,
      tagline: '+13 % de Cauris bonus — sans abonnement',
    },
    {
      code: 'cauris_3200',
      name: 'Trésor Royal • 3 200 Cauris',
      priceXof: 5000,
      caurisAmount: 3200,
      tagline: '+28 % de Cauris bonus — validité illimitée',
    },
  ],
  caurisActions: [
    { code: 'direct_dm', label: 'DM Direct avant match', costCauris: 100 },
    { code: 'reveal_admirer', label: 'Révéler un admirateur', costCauris: 120 },
    { code: 'boost_24h', label: 'Boost Tête d’affiche 24h', costCauris: 150 },
    { code: 'rewind_pass', label: 'Revenir sur un profil passé', costCauris: 60 },
    { code: 'incognito_7d', label: 'Mode Incognito 7 jours', costCauris: 200 },
  ],
  culturalGifts: [
    { code: 'rose_abidjan', name: 'Rose d’Abidjan', emoji: '🌹', costCauris: 50, message: 'Une attention élégante pour ouvrir la discussion' },
    { code: 'bissap_frais', name: 'Bissap Royal Glacé', emoji: '🍷', costCauris: 80, message: 'Rafraîchissant comme un coucher de soleil à Cocody' },
    { code: 'cacao_grand_cru', name: 'Cacao Grand Cru 225', emoji: '🍫', costCauris: 150, message: 'Le meilleur chocolat ivoirien rien que pour toi' },
    { code: 'escapade_assinie', name: 'Couronne Sunset Assinie', emoji: '👑', costCauris: 400, message: 'Grand jeu & intention assumée' },
  ],
  paymentMethods: GENIUSPAY_METHODS,
  storeArbitrationNote: {
    web: 'Paiement direct par GeniusPay (Wave, Orange Money, MTN MoMo, Moov, Visa/MC) — 0 % commission App Store.',
    flutterStoresDigital: 'Sur Flutter iOS App Store & Google Play, les biens numériques in-app passent par Apple IAP / Google Play Billing synchronisés sur ce même compte, ou via recharge Web GeniusPay.',
    flutterStoresPhysical: 'Pour les réservations Safe Date & billets de soirées physiques à Abidjan, GeniusPay Flutter SDK est directement autorisé sur iOS et Android.',
  },
};

export function getEffectiveSubscriptionTier(userRow) {
  const tier = userRow?.subscription_tier || 'free';
  if (tier === 'free') return 'free';
  if (userRow?.subscription_expires_at) {
    const expMs = Date.parse(userRow.subscription_expires_at);
    if (Number.isFinite(expMs) && expMs <= Date.now()) {
      return 'free';
    }
  }
  return tier;
}

export function findCatalogItem(itemCode) {
  const sub = STORE_CATALOG.subscriptions.find((s) => s.code === itemCode);
  if (sub) return { ...sub, itemType: 'subscription' };
  const pack = STORE_CATALOG.caurisPacks.find((p) => p.code === itemCode);
  if (pack) return { ...pack, itemType: 'cauris_pack' };
  return null;
}

async function creditCaurisDirect(db, userId, amount, reason, reference = '') {
  const numeric = Math.floor(Number(amount));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const txId = `tx_${crypto.randomUUID().slice(0, 12)}`;
  await db.run('UPDATE users SET cauris_balance = cauris_balance + ? WHERE id = ?', numeric, userId);
  await db.run(
    `INSERT INTO wallet_transactions (id, user_id, tx_type, amount_cauris, reason, reference)
     VALUES (?, ?, 'credit', ?, ?, ?)`,
    txId,
    userId,
    numeric,
    reason,
    reference
  );
  const row = await db.get('SELECT cauris_balance FROM users WHERE id = ?', userId);
  return row ? Number(row.cauris_balance) : 0;
}

export async function creditCauris(db, userId, amount, reason, reference = '') {
  return runInTransaction(db, (tx) => creditCaurisDirect(tx, userId, amount, reason, reference));
}

export async function spendCauris(db, userId, amount, reason, reference = '') {
  const numeric = Math.floor(Number(amount));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { ok: false, error: 'Montant invalide', balance: 0 };
  }
  return runInTransaction(db, async (tx) => {
    const upd = await tx.run(
      'UPDATE users SET cauris_balance = cauris_balance - ? WHERE id = ? AND cauris_balance >= ?',
      numeric,
      userId,
      numeric
    );

    if (!upd.changes) {
      const user = await tx.get('SELECT cauris_balance FROM users WHERE id = ?', userId);
      return {
        ok: false,
        error: 'Solde de Cauris insuffisant',
        balance: user ? Number(user.cauris_balance) : 0,
      };
    }

    const txId = `tx_${crypto.randomUUID().slice(0, 12)}`;
    await tx.run(
      `INSERT INTO wallet_transactions (id, user_id, tx_type, amount_cauris, reason, reference)
       VALUES (?, ?, 'debit', ?, ?, ?)`,
      txId,
      userId,
      numeric,
      reason,
      reference
    );
    const updated = await tx.get('SELECT cauris_balance FROM users WHERE id = ?', userId);
    return { ok: true, balance: Number(updated.cauris_balance), txId };
  });
}

export async function claimDailyCheckin(db, userId) {
  return runInTransaction(db, async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    const user = await tx.get(
      'SELECT last_checkin_date, checkin_streak, cauris_balance FROM users WHERE id = ?',
      userId
    );
    if (!user) return { ok: false, error: 'Utilisateur introuvable' };
    if (user.last_checkin_date === today) {
      return {
        ok: false,
        alreadyClaimed: true,
        streak: Number(user.checkin_streak),
        balance: Number(user.cauris_balance),
        message: 'Bonus du jour déjà réclamé ! Reviens demain.',
      };
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const nextStreak = user.last_checkin_date === yesterday ? Number(user.checkin_streak) + 1 : 1;
    const reward = Math.min(40, 15 + (nextStreak - 1) * 5);

    await tx.run(
      'UPDATE users SET last_checkin_date = ?, checkin_streak = ? WHERE id = ?',
      today,
      nextStreak,
      userId
    );
    const newBalance = await creditCaurisDirect(
      tx,
      userId,
      reward,
      `Série quotidienne (Jour ${nextStreak})`,
      `STREAK-${today}`
    );

    return {
      ok: true,
      reward,
      streak: nextStreak,
      balance: newBalance,
      message: `+${reward} Cauris offerts (Série : ${nextStreak} jour${nextStreak > 1 ? 's' : ''}) !`,
    };
  });
}

export async function fulfillPaymentOrder(db, reference, details = {}) {
  return runInTransaction(db, async (tx) => {
    const order = await tx.get('SELECT * FROM payment_orders WHERE reference = ?', reference);
    if (!order) return { ok: false, error: 'Commande introuvable' };

    if (order.fulfilled) {
      return { ok: true, alreadyFulfilled: true, order: { ...order } };
    }

    if (details.amount !== undefined && Number(details.amount) < Number(order.amount_xof)) {
      return { ok: false, error: 'Montant payé inférieur au montant de la commande' };
    }

    const nowIso = new Date().toISOString();
    const method = details.payment_method || order.payment_method || 'wave';
    const fees = details.fees !== undefined ? Number(details.fees) : Number(order.fees_xof || 0);
    const netAmount =
      details.net_amount !== undefined ? Number(details.net_amount) : Math.max(0, Number(order.amount_xof) - fees);

    const claim = await tx.run(
      `UPDATE payment_orders
       SET status = 'completed', payment_method = ?, fees_xof = ?, net_amount_xof = ?, fulfilled = 1, completed_at = ?
       WHERE reference = ? AND fulfilled = 0`,
      method,
      fees,
      netAmount,
      nowIso,
      reference
    );

    if (!claim.changes) {
      const current = await tx.get('SELECT * FROM payment_orders WHERE reference = ?', reference);
      return { ok: true, alreadyFulfilled: true, order: { ...current } };
    }

    let grantedSummary = '';
    if (order.item_type === 'subscription') {
      const sub = STORE_CATALOG.subscriptions.find((s) => s.code === order.item_code);
      if (sub) {
        const currentUser = await tx.get(
          'SELECT subscription_expires_at FROM users WHERE id = ?',
          order.user_id
        );
        const existingExp = currentUser?.subscription_expires_at ? Date.parse(currentUser.subscription_expires_at) : 0;
        const baseTime = Number.isFinite(existingExp) && existingExp > Date.now() ? existingExp : Date.now();
        const expiresAt = new Date(baseTime + sub.durationDays * 86400000).toISOString();

        await tx.run(
          'UPDATE users SET subscription_tier = ?, subscription_expires_at = ? WHERE id = ?',
          sub.code,
          expiresAt,
          order.user_id
        );
        if (sub.caurisBonus > 0) {
          await creditCaurisDirect(tx, order.user_id, sub.caurisBonus, `Bonus ${sub.name}`, reference);
        }
        if (sub.code === 'diaspora_vip') {
          await tx.run('UPDATE users SET passport_active = 1 WHERE id = ?', order.user_id);
        }
        grantedSummary = `${sub.name} activé + ${sub.caurisBonus} Cauris`;
      }
    } else if (order.item_type === 'cauris_pack') {
      const pack = STORE_CATALOG.caurisPacks.find((p) => p.code === order.item_code);
      if (pack) {
        await creditCaurisDirect(tx, order.user_id, pack.caurisAmount, `Achat ${pack.name} via GeniusPay`, reference);
        grantedSummary = `+${pack.caurisAmount} Cauris crédités`;
      }
    } else if (order.item_type === 'event_ticket') {
      const meta = parseJsonSafe(order.metadata_json, {});
      if (meta.booking_id) {
        await tx.run("UPDATE date_bookings SET status = 'confirmed' WHERE id = ?", meta.booking_id);
      }
      grantedSummary = `Réservation Safe Date confirmée (${reference})`;
    }

    const updatedOrder = await tx.get('SELECT * FROM payment_orders WHERE reference = ?', reference);
    return {
      ok: true,
      alreadyFulfilled: false,
      grantedSummary,
      order: { ...updatedOrder },
    };
  });
}
