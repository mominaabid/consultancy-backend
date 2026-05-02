import Ably from 'ably';
import { ABLY_KEY } from '../config/env.js';

// ✅ ONE CLIENT ONLY
const ably = new Ably.Rest(ABLY_KEY);

// ─────────────────────────────
// Publish message
// ─────────────────────────────
export async function publishToChannel(channelName, eventName, data) {
  const channel = ably.channels.get(channelName);
  await channel.publish(eventName, data);
}

// ─────────────────────────────
// TOKEN GENERATION (NEW SAFE METHOD)
// ─────────────────────────────
export function generateAblyToken(req, res) {
  const tokenRequest = ably.auth.createTokenRequest({
    clientId: String(req.user.id),
    capability: {
      "*": ["subscribe", "publish", "presence"]
    }
  });

  res.json(tokenRequest);
}