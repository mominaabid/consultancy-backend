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
export async function generateAblyToken(req, res) {
  try {
    const tokenRequest = await ably.auth.createTokenRequest({
      clientId: String(req.user.id),
      capability: {
        '*': ['subscribe', 'publish', 'presence'],
      },
    });

    console.log('🔑 Token generated for user:', req.user.id, tokenRequest);
    res.json(tokenRequest); // now sends the actual token object
  } catch (err) {
    console.error('❌ Token generation failed:', err);
    res.status(500).json({ message: err.message });
  }
}