// src/routes/public/lead.routes.js
// Public (no-auth) routes used by the Educatia website.
//
// ⚠️ DEPRECATED: POST /api/v1/public/leads ab lead NAHI banata.
// Website submissions ab Online Queries me jati hain, aur admin portal par
// review karke unhe lead me convert karta hai. Ye route sirf backward
// compatibility ke liye zinda hai — jo website build abhi deploy hai wo purane
// endpoint par POST karta rahega aur uska data bhi theek jagah (online_queries)
// pohnch jayega.
//
// Website ke naye endpoint (POST /api/v1/public/queries) par shift hone ke
// 2–4 hafte baad ye POST route hata dena. — Plan Phase 4
import { Router } from "express";
import { getLeadHistory } from "../../controllers/lead.controller.js";
import { createOnlineQuery } from "../../controllers/onlineQuery.controller.js";

const router = Router();

// POST /api/v1/public/leads  → ab online query banta hai (lead nahi)
router.post("/", createOnlineQuery);

// GET /api/v1/public/leads/track?email=&phone=  → check your application status
// (email AND phone dono match hone chahiye — anti-enumeration). Ab ye un
// visitors ko bhi jawab deta hai jinki query abhi lead me convert nahi hui.
router.get("/track", getLeadHistory);

export default router;
