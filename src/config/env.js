import 'dotenv/config';

export const ABLY_KEY = process.env.ABLY_API_KEY;

if (!ABLY_KEY) {
  console.error("❌ ABLY_API_KEY missing at startup");
  process.exit(1);
}