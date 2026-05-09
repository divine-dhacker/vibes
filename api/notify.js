// /api/notify.js
// Vercel serverless function — proxies push notification requests to OneSignal
// This runs on the SERVER so there are no CORS issues
// Place this file at: api/notify.js in your GitHub repo root

const ONESIGNAL_APP_ID = 'b5a57967-95c6-4e68-8a23-c92279067dea';
const ONESIGNAL_REST_KEY = 'os_v2_app_wwsxsz4vyzhgrcrdzerhsbt55lmjm2om47tushv3enoqwiw2mz3ic4qabdltoykudiq7gsgzp3t7g6vrkf3qeypl5gt6zynlcg7pnoy';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { roomId, title, message, excludeOsId } = req.body;

  if (!roomId || !message) {
    return res.status(400).json({ error: 'Missing roomId or message' });
  }

  const body = {
    app_id: ONESIGNAL_APP_ID,
    filters: [
      { field: 'tag', key: 'room_' + roomId, relation: '=', value: '1' }
    ],
    headings: { en: title || '👻 GhostRoom' },
    contents: { en: message },
    url: 'https://ghostrooom.vercel.app/#' + roomId,
    chrome_web_icon: 'https://divine-dhacker.github.io/vibes/ghostrooms.png',
    firefox_icon: 'https://divine-dhacker.github.io/vibes/ghostrooms.png'
  };

  // Exclude the sender so they don't get their own notification
  if (excludeOsId) {
    body.exclude_external_user_ids = [excludeOsId];
  }

  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + ONESIGNAL_REST_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

