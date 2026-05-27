// /api/notify.js
// Vercel serverless function — sends FCM push notifications via Firebase Admin SDK
// Place this file at: api/notify.js in your repo root
//
// SETUP REQUIRED:
// 1. In Vercel dashboard → Settings → Environment Variables, add:
//    FIREBASE_SERVICE_ACCOUNT  →  (paste the full JSON string of your service account key)
// 2. Get your service account key from:
//    Firebase Console → Project Settings → Service Accounts → Generate new private key
//    Then paste the entire JSON as one line into the env var value

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// ── INIT FIREBASE ADMIN (safe to call multiple times on Vercel) ──
function initAdmin() {
  if (getApps().length > 0) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

const AID = 'ghostroom-v4-influence'; // must match your index.html

// ── NOTIFICATION TYPES ──
// Covers all events GhostRoom can fire:
//   'message'    — new chat message
//   'mention'    — someone tagged you with #handle
//   'reaction'   — someone reacted to your message
//   'join'       — someone joined your room
//   'nudge'      — nudge sent
//   'voice'      — voice note received
//   'sticker'    — sticker received
//   'poll'       — new poll created
//   'image'      — image received

function buildNotificationPayload(type, data) {
  const { title, message, roomId, senderHandle } = data;
  const url = `https://ghostrooom.vercel.app/#${roomId}`;

  // Default
  let notif = {
    title: title || '👻 GhostRoom',
    body: message || 'Something happened in your room',
  };

  switch (type) {
    case 'mention':
      notif = {
        title: `👻 ${senderHandle || 'Someone'} mentioned you`,
        body: message || `You were tagged in #${roomId?.toUpperCase()}`,
      };
      break;
    case 'reaction':
      notif = {
        title: `${data.emoji || '❤️'} Reaction`,
        body: `${senderHandle || 'Someone'} reacted to your message`,
      };
      break;
    case 'join':
      notif = {
        title: '👤 New ghost entered',
        body: `Someone just joined #${roomId?.toUpperCase()}`,
      };
      break;
    case 'nudge':
      notif = {
        title: '📳 Nudge!',
        body: `${senderHandle || 'Someone'} nudged you in #${roomId?.toUpperCase()}`,
      };
      break;
    case 'voice':
      notif = {
        title: `🎙️ ${senderHandle || 'Someone'} sent a voice note`,
        body: `New voice note in #${roomId?.toUpperCase()}`,
      };
      break;
    case 'sticker':
      notif = {
        title: `🎉 ${senderHandle || 'Someone'} sent a sticker`,
        body: `New sticker in #${roomId?.toUpperCase()}`,
      };
      break;
    case 'image':
      notif = {
        title: `📷 ${senderHandle || 'Someone'} sent a photo`,
        body: `New image in #${roomId?.toUpperCase()}`,
      };
      break;
    case 'poll':
      notif = {
        title: `📊 New poll in #${roomId?.toUpperCase()}`,
        body: message || 'A new poll was created',
      };
      break;
    case 'message':
    default:
      notif = {
        title: title || `${senderHandle || '👻'} in #${roomId?.toUpperCase()}`,
        body: message || 'New message',
      };
  }

  return { notif, url };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    roomId,
    targetUid,        // optional — send to a specific user (for mentions/reactions)
    title,
    message,
    type = 'message', // notification type (see above)
    senderHandle,
    emoji,
    excludeToken,     // FCM token of sender — they won't get their own notif
  } = req.body;

  if (!roomId && !targetUid) {
    return res.status(400).json({ error: 'Missing roomId or targetUid' });
  }

  try {
    initAdmin();
    const db = getFirestore();
    const messaging = getMessaging();

    let tokens = [];

    if (targetUid) {
      // ── TARGETED: send to a specific user (mention, reaction, etc.) ──
      const snap = await db
        .collection('artifacts').doc(AID)
        .collection('public').doc('data')
        .collection('fcmTokens').doc(targetUid)
        .get();

      if (snap.exists) {
        const token = snap.data().token;
        if (token && token !== excludeToken) tokens.push(token);
      }
    } else {
      // ── BROADCAST: send to everyone in the room ──
      const snap = await db
        .collection('artifacts').doc(AID)
        .collection('public').doc('data')
        .collection('fcmTokens')
        .get();

      snap.forEach(doc => {
        const data = doc.data();
        const rooms = data.rooms || [];
        if (rooms.includes(roomId) && data.token && data.token !== excludeToken) {
          tokens.push(data.token);
        }
      });
    }

    if (tokens.length === 0) {
      return res.status(200).json({ sent: 0, message: 'No eligible tokens' });
    }

    const { notif, url } = buildNotificationPayload(type, {
      title, message, roomId, senderHandle, emoji
    });

    // Send in batches of 500 (FCM limit)
    const BATCH = 500;
    let successCount = 0;
    let failureCount = 0;
    const staleTokens = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: notif.title,
          body: notif.body,
        },
        webpush: {
          notification: {
            title: notif.title,
            body: notif.body,
            icon: 'https://divine-dhacker.github.io/vibes/ghostrooms.png',
            badge: 'https://divine-dhacker.github.io/vibes/ghostrooms.png',
            click_action: url,
          },
          fcmOptions: { link: url },
        },
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      // Collect stale/invalid tokens for cleanup
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            staleTokens.push(batch[idx]);
          }
        }
      });
    }

    // ── CLEANUP: remove stale tokens from Firestore ──
    if (staleTokens.length > 0) {
      const tokenDocs = await db
        .collection('artifacts').doc(AID)
        .collection('public').doc('data')
        .collection('fcmTokens')
        .get();

      const batch = db.batch();
      tokenDocs.forEach(doc => {
        if (staleTokens.includes(doc.data().token)) {
          batch.delete(doc.ref);
        }
      });
      await batch.commit().catch(() => {});
    }

    return res.status(200).json({ sent: successCount, failed: failureCount });
  } catch (e) {
    console.error('notify error:', e);
    return res.status(500).json({ error: e.message });
  }
}
