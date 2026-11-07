// src/controllers/onlineQuery.controller.js
// ─────────────────────────────────────────────────────────────────────────────
// ONLINE QUERIES
//
// Website ("Apply Now") submissions pehle yahan aati hain — `leads` me nahi.
// Admin portal par unhe review karta hai aur "Convert to Lead" par hi `leads`
// me row banti hai.
//
// Leads se do ahem farq:
//   1. Duplicate email/phone par submission BLOCK nahi hoti — save ho jati hai
//      aur bas flag lag jata hai. (Wohi banda dobara poochh sakta hai.)
//   2. Ye rows kabhi Leads Kanban / dashboard stats me nahi ginti.
//
// Admin-only: saare /admin/online-queries routes par `role('admin')` guard hai.
// ─────────────────────────────────────────────────────────────────────────────
import db from "../models/mysql/index.js";
import rawDb from "../config/db.js";
import { logActivity } from "../services/activityLog.service.js";
import sseManager from "../utils/sseManager.js";
import { storeNotification } from "../utils/notificationHelper.js";
import {
  sendNewOnlineQueryEmail,
  sendLeadConfirmationEmail,
} from "../services/email.service.js";
import {
  resolveConfigId,
  validateNoDuplicateDegrees,
  handleLeadEducation,
} from "./lead.controller.js";

const { OnlineQuery, Lead, User } = db;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

// In-memory rate limiter: max 5 submissions per IP per 10 minutes.
const queryRateMap = new Map();
const QUERY_RATE_WINDOW_MS = 10 * 60 * 1000;
const QUERY_RATE_MAX = 5;

function isQueryRateLimited(ip) {
  const now = Date.now();
  const entry = queryRateMap.get(ip);
  if (!entry || now - entry.start > QUERY_RATE_WINDOW_MS) {
    queryRateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > QUERY_RATE_MAX;
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

// Phone ko sirf digits par le aata hai taake "+92 300 1234567" aur
// "03001234567" ko ek hi samjha jaye.
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

const ENGLISH_TEST_MAX = { ielts: 9, toefl: 120, pte: 90, duolingo: 160 };

// Validation rules portal ke leads se bilkul same hain — taake convert ke waqt
// data reject na ho jaye.
function validateQueryPayload(body) {
  const errors = [];
  const {
    name,
    email,
    phone,
    english_test,
    english_test_score,
    education,
  } = body || {};

  const trimmedName = String(name || "").trim();
  if (!trimmedName) errors.push("Full name is required.");
  else if (trimmedName.length < 3 || trimmedName.length > 50)
    errors.push("Name must be 3–50 characters long.");
  else if (!/^[A-Za-z\s]+$/.test(trimmedName))
    errors.push("Name must contain only letters and spaces.");

  const trimmedEmail = String(email || "").trim().toLowerCase();
  if (!trimmedEmail) errors.push("Email is required.");
  else if (!/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/.test(trimmedEmail))
    errors.push("Email must be a valid format (e.g., name@domain.com).");

  const trimmedPhone = String(phone || "").trim();
  if (!trimmedPhone) errors.push("Phone number is required.");
  else if (normalizePhone(trimmedPhone).length < 11)
    errors.push("Phone number must have at least 11 digits.");

  // ── English test (optional) ──
  const englishTestName = String(english_test || "").trim();
  const hasEnglishTest =
    englishTestName.length > 0 && !/not\s*yet/i.test(englishTestName);
  let englishScoreValue = null;
  if (hasEnglishTest) {
    const max = ENGLISH_TEST_MAX[englishTestName.toLowerCase()];
    englishScoreValue = parseFloat(String(english_test_score ?? "").trim());
    if (isNaN(englishScoreValue)) {
      errors.push(`Please provide your ${englishTestName} overall score.`);
    } else if (max && (englishScoreValue < 0 || englishScoreValue > max)) {
      errors.push(`${englishTestName} score must be between 0 and ${max}.`);
    } else if (
      englishTestName.toLowerCase() !== "ielts" &&
      !Number.isInteger(englishScoreValue)
    ) {
      errors.push(`${englishTestName} score must be a whole number.`);
    }
  }

  // ── Education (optional; website sirf ek "last degree" bhejti hai) ──
  const currentYear = new Date().getFullYear();
  const educationInput = (Array.isArray(education) ? education : []).filter(
    (e) => e && (e.degree || e.degree_id)
  );
  educationInput.forEach((edu, idx) => {
    const year = Number(edu.year_awarded);
    if (!edu.year_awarded || isNaN(year) || year < 1950 || year > currentYear) {
      errors.push(
        `Education #${idx + 1}: year awarded must be between 1950 and ${currentYear}.`
      );
    }
  });

  return {
    errors,
    clean: {
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      hasEnglishTest,
      englishTestName,
      englishScoreValue,
      educationInput,
    },
  };
}

// Kya is email/phone se pehle se koi lead mojood hai?
// Phone ko normalize karke compare karte hain taake formatting ka farq na pade.
async function findMatchingLead(email, phone) {
  const trimmedEmail = String(email || "").trim().toLowerCase();
  const phoneDigits = normalizePhone(phone);

  if (trimmedEmail) {
    const byEmail = await Lead.findOne({ where: { email: trimmedEmail } });
    if (byEmail) return { lead: byEmail, field: "email" };
  }

  if (phoneDigits) {
    try {
      const [rows] = await rawDb.query(
        `SELECT * FROM leads
          WHERE is_deleted = 0
            AND REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '(', '')
                = ?
          LIMIT 1`,
        [phoneDigits]
      );
      if (rows?.[0]) return { lead: rows[0], field: "phone" };
    } catch {
      const byPhone = await Lead.findOne({ where: { phone: String(phone).trim() } });
      if (byPhone) return { lead: byPhone, field: "phone" };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — POST /api/v1/public/queries   (no auth, called by the website)
// ─────────────────────────────────────────────────────────────────────────────
export async function createOnlineQuery(req, res) {
  try {
    const ip = getClientIp(req);

    if (isQueryRateLimited(ip)) {
      return res.status(429).json({
        success: false,
        message: "Too many submissions. Please try again later.",
      });
    }

    const { errors, clean } = validateQueryPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    const {
      city,
      country,
      course,
      message,
      source,
      page_url,
      website,         // honeypot — sirf bots isay bharte hain
    } = req.body || {};

    // ── Extra anti-spam: same email + same IP se 24h me max 3 queries ──
    try {
      const [[{ recent } = { recent: 0 }]] = await rawDb.query(
        `SELECT COUNT(*) AS recent FROM online_queries
          WHERE is_deleted = 0 AND email = ? AND ip_address = ?
            AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
        [clean.email, ip]
      );
      if (recent >= 3) {
        return res.status(429).json({
          success: false,
          message:
            "We've already received your request. Our team will contact you soon.",
        });
      }
    } catch (err) {
      console.error("⚠️ Online query throttle check failed:", err.message);
    }

    const firstDegree = clean.educationInput[0] || null;

    const data = {
      name: clean.name,
      email: clean.email,
      phone: clean.phone,
      city: city && String(city).trim() ? String(city).trim() : null,
      preferred_country:
        country && String(country).trim() ? String(country).trim() : null,
      course: course && String(course).trim() ? String(course).trim() : null,
      message: message && String(message).trim() ? String(message).trim() : null,
      english_test: clean.hasEnglishTest ? clean.englishTestName : null,
      english_test_score: clean.hasEnglishTest ? clean.englishScoreValue : null,
      last_degree: firstDegree ? String(firstDegree.degree).trim() : null,
      degree_year: firstDegree ? Number(firstDegree.year_awarded) : null,
      degree_grades: firstDegree?.grades_cgpa
        ? String(firstDegree.grades_cgpa).trim()
        : null,
      degree_university: firstDegree?.board_university
        ? String(firstDegree.board_university).trim()
        : null,
      source: source && String(source).trim() ? String(source).trim() : "Website",
      page_url: page_url ? String(page_url).slice(0, 255) : null,
      ip_address: ip.slice(0, 45),
      // Honeypot bhara hua hai → chupke se spam mark kar do, visitor ko normal
      // success dikhao taake bot ko pata na chale.
      status: website ? "spam" : "new",
    };

    const query = await OnlineQuery.create(data);

    // Pehle se lead mojood hai? Visitor ko block nahi karte — bas bata dete hain.
    const match = await findMatchingLead(clean.email, clean.phone);

    // Spam ko aage notify nahi karte.
    if (data.status !== "spam") {
      notifyAdminsOfNewQuery(query).catch((err) =>
        console.error("⚠️ Online query admin notification failed:", err)
      );

      sendLeadConfirmationEmail({
        to: query.email,
        name: query.name,
        reference: `EDU-Q-${query.id}`,
      }).catch((err) =>
        console.error("Background query confirmation email error:", err)
      );
    }


    return res.status(201).json({
      success: true,
      message: "Your consultation request has been received!",
      already_registered: !!match,
      query: { id: query.id, name: query.name, reference: `EDU-Q-${query.id}` },
    });
  } catch (error) {
    console.error("❌ Error creating online query:", error);
    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while submitting your request. Please try again.",
    });
  }
}

// Saare admins ko SSE + stored notification + email. Kabhi throw nahi karta.
async function notifyAdminsOfNewQuery(query) {
  const admins = await User.findAll({
    where: { role: "admin", is_active: true },
    attributes: ["id", "name", "email"],
  });

  for (const admin of admins) {
    const notifMessage = `🌐 New online query: "${query.name}"${
      query.preferred_country ? ` (${query.preferred_country})` : ""
    } — review it on the Online Queries page.`;

    sseManager.sendToUser(admin.id.toString(), {
      type: "online_query_created",
      message: notifMessage,
      queryId: query.id,
      queryName: query.name,
    });

    await storeNotification(admin.id, "online_query_created", notifMessage, {
      queryId: query.id,
      queryName: query.name,
      source: query.source || "Website",
    });

    if (admin.email) {
      sendNewOnlineQueryEmail({
        adminEmail: admin.email,
        adminName: admin.name,
        query,
      }).catch((err) => console.error("Background email error:", err));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — GET /api/v1/admin/online-queries
// ─────────────────────────────────────────────────────────────────────────────
export async function getAllOnlineQueries(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      source,
      country,
      start,
      end,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ` WHERE q.is_deleted = 0`;
    const params = [];

    if (search) {
      where += ` AND (q.name LIKE ? OR q.email LIKE ? OR q.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (status) {
      where += ` AND q.status = ?`;
      params.push(status);
    }
    if (source) {
      where += ` AND q.source = ?`;
      params.push(source);
    }
    if (country) {
      where += ` AND q.preferred_country = ?`;
      params.push(country);
    }
    if (start && end) {
      where += ` AND q.created_at BETWEEN ? AND ?`;
      params.push(new Date(start), new Date(end));
    }

    // existing_lead_id: is query ke email/phone se koi lead pehle se mojood hai?
    // Portal is par "Already a lead" badge dikhata hai.
    const sql = `
      SELECT
        q.*,
        ru.name AS reviewed_by_name,
        cu.name AS converted_by_name,
        (
          SELECT l.id FROM leads l
           WHERE l.is_deleted = 0
             AND (
               l.email = q.email
               OR REPLACE(REPLACE(REPLACE(REPLACE(l.phone,' ',''),'-',''),'+',''),'(','')
                  = REPLACE(REPLACE(REPLACE(REPLACE(q.phone,' ',''),'-',''),'+',''),'(','')
             )
           LIMIT 1
        ) AS existing_lead_id
      FROM online_queries q
      LEFT JOIN users ru ON q.reviewed_by  = ru.id
      LEFT JOIN users cu ON q.converted_by = cu.id
      ${where}
      ORDER BY q.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [countResult] = await rawDb.query(
      `SELECT COUNT(*) AS total FROM online_queries q ${where}`,
      params
    );
    const total = countResult[0]?.total || 0;

    const [rows] = await rawDb.query(sql, [
      ...params,
      parseInt(limit),
      parseInt(offset),
    ]);

    return res.json({
      success: true,
      data: {
        queries: rows || [],
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching online queries:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch online queries." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — GET /api/v1/admin/online-queries/stats
// ─────────────────────────────────────────────────────────────────────────────
export async function getOnlineQueryStats(req, res) {
  try {
    const [rows] = await rawDb.query(`
      SELECT
        COUNT(*)                                                   AS total,
        SUM(status = 'new')                                        AS new_count,
        SUM(status = 'reviewed')                                   AS reviewed,
        SUM(status = 'converted')                                  AS converted,
        SUM(status = 'spam')                                       AS spam,
        SUM(DATE(created_at) = CURDATE())                          AS today
      FROM online_queries
      WHERE is_deleted = 0
    `);

    const r = rows[0] || {};
    const total = Number(r.total || 0);
    const converted = Number(r.converted || 0);
    // Spam ko conversion rate se bahar rakhte hain — wo kabhi lead banni hi
    // nahi thi, is liye usay denominator me ginna rate ko jhoota kam dikhata.
    const spam = Number(r.spam || 0);
    const considered = total - spam;

    return res.json({
      success: true,
      data: {
        total,
        new: Number(r.new_count || 0),
        reviewed: Number(r.reviewed || 0),
        converted,
        spam,
        today: Number(r.today || 0),
        conversion_rate:
          considered > 0 ? Math.round((converted / considered) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching online query stats:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch stats." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — GET /api/v1/admin/online-queries/:id
// ─────────────────────────────────────────────────────────────────────────────
export async function getOnlineQueryById(req, res) {
  try {
    const [rows] = await rawDb.query(
      `SELECT q.*, ru.name AS reviewed_by_name, cu.name AS converted_by_name
         FROM online_queries q
         LEFT JOIN users ru ON q.reviewed_by  = ru.id
         LEFT JOIN users cu ON q.converted_by = cu.id
        WHERE q.id = ? AND q.is_deleted = 0
        LIMIT 1`,
      [req.params.id]
    );

    const query = rows?.[0];
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Online query not found." });
    }

    const match = await findMatchingLead(query.email, query.phone);

    return res.json({
      success: true,
      data: {
        ...query,
        existing_lead: match
          ? {
              id: match.lead.id,
              name: match.lead.name,
              status: match.lead.status,
              matched_on: match.field,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching online query:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch online query." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — PUT /api/v1/admin/online-queries/:id/status
// 'converted' is route se set nahi ho sakta — wo sirf convert endpoint karta hai.
// ─────────────────────────────────────────────────────────────────────────────
export async function updateOnlineQueryStatus(req, res) {
  try {
    const { status } = req.body || {};
    const allowed = ["new", "reviewed", "spam"];

    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowed.join(", ")}.`,
      });
    }

    const query = await OnlineQuery.findByPk(req.params.id);
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Online query not found." });
    }

    if (query.status === "converted") {
      return res.status(409).json({
        success: false,
        message:
          "This query has already been converted to a lead and cannot be changed.",
        converted_lead_id: query.converted_lead_id,
      });
    }

    await rawDb.query(
      `UPDATE online_queries
          SET status = ?, reviewed_by = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [status, req.user.id, query.id]
    );

    return res.json({
      success: true,
      message: `Query marked as ${status}.`,
      data: { id: query.id, status },
    });
  } catch (error) {
    console.error("❌ Error updating online query status:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update status." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — PUT /api/v1/admin/online-queries/:id/note
// ─────────────────────────────────────────────────────────────────────────────
export async function addOnlineQueryNote(req, res) {
  try {
    const { note } = req.body || {};

    const query = await OnlineQuery.findByPk(req.params.id);
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Online query not found." });
    }

    await rawDb.query(`UPDATE online_queries SET admin_note = ? WHERE id = ?`, [
      note ? String(note).trim() : null,
      query.id,
    ]);

    return res.json({ success: true, message: "Note saved." });
  } catch (error) {
    console.error("❌ Error saving online query note:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save note." });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — POST /api/v1/admin/online-queries/:id/convert
//
// Query → Lead. Lead hamesha `new` stage me UNASSIGNED banti hai; counsellor
// admin baad me Leads page se assign karta hai (wahan ka maujooda flow khud
// counsellor ko notify kar deta hai).
//
// body (sab optional — admin modal me data edit kar sakta hai):
//   name, email, phone, city, country, course, message,
//   english_test, english_test_score,
//   education: [{ degree, year_awarded, grades_cgpa, board_university }],
//   force: true          → duplicate lead ke bawajood nayi lead banao
//   link_to_lead_id: N   → nayi lead mat banao, is maujooda lead se jod do
// ─────────────────────────────────────────────────────────────────────────────
export async function convertQueryToLead(req, res) {
  let conn;
  try {
    const query = await OnlineQuery.findByPk(req.params.id);
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Online query not found." });
    }

    if (query.status === "converted") {
      return res.status(409).json({
        success: false,
        already_converted: true,
        message: "This query has already been converted to a lead.",
        converted_lead_id: query.converted_lead_id,
      });
    }

    const body = req.body || {};

    // ── Option: nayi lead banane ke bajaye maujooda lead se link kar do ──
    if (body.link_to_lead_id) {
      const existing = await Lead.findByPk(Number(body.link_to_lead_id));
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: "That lead no longer exists." });
      }

      await rawDb.query(
        `UPDATE online_queries
            SET status = 'converted', converted_lead_id = ?, converted_by = ?, converted_at = NOW()
          WHERE id = ?`,
        [existing.id, req.user.id, query.id]
      );

      // ── Lead ke KHAALI khane query se bhar do ──
      // Jo field lead par pehle se bhara hai usay haath nahi lagate: agar lead
      // "UK" keh rahi hai aur nayi query "Canada", to UK wahin rehta hai aur
      // Canada neeche activity note me darj ho jata hai. Overwrite karne se
      // ghalti se link karne par asli maloomat zaya ho jati.
      const fills = {};
      if (!existing.preferred_country && query.preferred_country)
        fills.preferred_country = query.preferred_country;
      if (!existing.home_address && query.city) fills.home_address = query.city;

      if (!existing.english_test_id && query.english_test) {
        const testId = await resolveConfigId("english_test_type", query.english_test);
        if (testId) {
          fills.english_test_id = testId;
          if (query.english_test_score != null)
            fills.english_test_overall_score = query.english_test_score;
        }
      }

      const filledLabels = Object.keys(fills);
      if (filledLabels.length > 0) {
        const setSql = filledLabels.map((k) => `${k} = ?`).join(", ");
        await rawDb.query(`UPDATE leads SET ${setSql} WHERE id = ?`, [
          ...filledLabels.map((k) => fills[k]),
          existing.id,
        ]);
      }

      // ── Query ki poori tafseel lead ki history me ──
      // Yahi wo jagah hai jahan counsellor ko nayi dilchaspi dikhti hai, chahe
      // lead ka country column purana hi rahe.
      const linkParts = [];
      if (query.preferred_country) linkParts.push(`Country: ${query.preferred_country}`);
      if (query.course) linkParts.push(`Course: ${query.course}`);
      if (query.english_test)
        linkParts.push(
          `English: ${query.english_test}${
            query.english_test_score != null ? ` — ${query.english_test_score}` : ""
          }`
        );
      if (query.last_degree)
        linkParts.push(
          `Last degree: ${query.last_degree}${
            query.degree_year ? ` (${query.degree_year})` : ""
          }`
        );
      if (query.city) linkParts.push(`City: ${query.city}`);
      if (query.message) linkParts.push(`Message: ${query.message}`);

      await logActivity({
        leadId: existing.id,
        actionType: "note_added",
        note:
          `Linked Online Query #${query.id} (${query.email}) — no new lead created.` +
          (linkParts.length > 0 ? ` · ${linkParts.join(" · ")}` : "") +
          (filledLabels.length > 0
            ? ` · Filled empty lead fields: ${filledLabels.join(", ")}.`
            : ""),
        performedBy: req.user.id,
        performedByRole: req.user.role,
        performedByName: req.user.name,
      });

      return res.json({
        success: true,
        linked: true,
        message: `Query linked to existing lead #${existing.id}.`,
        filled: filledLabels,
        lead: { id: existing.id, name: existing.name, status: existing.status },
      });
    }

    // ── Payload: body ke values query par override karte hain ──
    const merged = {
      name: body.name ?? query.name,
      email: body.email ?? query.email,
      phone: body.phone ?? query.phone,
      english_test: body.english_test ?? query.english_test,
      english_test_score: body.english_test_score ?? query.english_test_score,
      education: Array.isArray(body.education)
        ? body.education
        : query.last_degree
        ? [
            {
              degree: query.last_degree,
              year_awarded: query.degree_year,
              grades_cgpa: query.degree_grades,
              board_university: query.degree_university,
            },
          ]
        : [],
    };

    const { errors, clean } = validateQueryPayload(merged);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    // ── Duplicate check ──
    if (!body.force) {
      const match = await findMatchingLead(clean.email, clean.phone);
      if (match) {
        return res.status(409).json({
          success: false,
          duplicate: true,
          message: `A lead with this ${match.field} already exists.`,
          existing_lead: {
            id: match.lead.id,
            name: match.lead.name,
            email: match.lead.email,
            phone: match.lead.phone,
            status: match.lead.status,
            matched_on: match.field,
          },
        });
      }
    }

    // ── Config IDs transaction se BAHAR resolve karte hain: resolveConfigId
    // khud pool par likhta hai (find-or-create), is liye usay transaction ke
    // andar bulana deadlock de sakta hai. ──
    const sourceId = await resolveConfigId("lead_source", "Website");
    const englishTestId = clean.hasEnglishTest
      ? await resolveConfigId("english_test_type", clean.englishTestName)
      : null;

    const educationRows = [];
    for (const edu of clean.educationInput) {
      educationRows.push({
        degree_id: edu.degree_id
          ? Number(edu.degree_id)
          : await resolveConfigId("degree_type", String(edu.degree).trim()),
        year_awarded: Number(edu.year_awarded),
        grades_cgpa: edu.grades_cgpa ? String(edu.grades_cgpa).trim() : null,
        board_university: edu.board_university
          ? String(edu.board_university).trim()
          : null,
      });
    }

    const degreeError = validateNoDuplicateDegrees(educationRows);
    if (degreeError) {
      return res.status(400).json({ success: false, message: degreeError });
    }

    const city = body.city ?? query.city;
    const country = body.country ?? query.preferred_country;

    const leadData = {
      name: clean.name,
      email: clean.email,
      phone: clean.phone,
      source_id: sourceId,
      online_query_id: query.id,
      status: "new",
      counsellor_id: null, // convert par assign nahi hota — admin baad me karega
    };
    if (city && String(city).trim()) leadData.home_address = String(city).trim();
    if (country && String(country).trim())
      leadData.preferred_country = String(country).trim();
    if (clean.hasEnglishTest) {
      leadData.english_test_id = englishTestId;
      leadData.english_test_overall_score = clean.englishScoreValue;
    }

    // ── Transaction: lead + educations + query status ek saath ──
    conn = await rawDb.getConnection();
    await conn.beginTransaction();

    const leadKeys = Object.keys(leadData);
    const [insertResult] = await conn.query(
      `INSERT INTO leads (${leadKeys.join(", ")}) VALUES (${leadKeys
        .map(() => "?")
        .join(", ")})`,
      Object.values(leadData)
    );
    const leadId = insertResult.insertId;

    for (const edu of educationRows) {
      await conn.query(
        `INSERT INTO lead_educations (lead_id, degree_id, year_awarded, grades_cgpa, board_university)
         VALUES (?, ?, ?, ?, ?)`,
        [
          leadId,
          edu.degree_id,
          edu.year_awarded,
          edu.grades_cgpa,
          edu.board_university,
        ]
      );
    }

    await conn.query(
      `UPDATE online_queries
          SET status = 'converted', converted_lead_id = ?, converted_by = ?, converted_at = NOW()
        WHERE id = ?`,
      [leadId, req.user.id, query.id]
    );

    await conn.commit();
    conn.release();
    conn = null;

    // ── Commit ke baad: activity log (fail ho to lead phir bhi bani rahe) ──
    const course = body.course ?? query.course;
    const message = body.message ?? query.message;
    const extras = [];
    if (course && String(course).trim()) extras.push(`Course: ${String(course).trim()}`);
    if (clean.hasEnglishTest)
      extras.push(`English: ${clean.englishTestName} — ${clean.englishScoreValue}`);
    if (educationRows.length > 0 && clean.educationInput[0])
      extras.push(
        `Last degree: ${clean.educationInput[0].degree} (${clean.educationInput[0].year_awarded})`
      );
    if (message && String(message).trim())
      extras.push(`Message: ${String(message).trim()}`);

    logActivity({
      leadId,
      actionType: "lead_created",
      toValue: "new",
      note:
        `Converted from Online Query #${query.id} · Phone: ${clean.phone} · Country: ${
          leadData.preferred_country || "—"
        }` + (extras.length > 0 ? ` · ${extras.join(" · ")}` : ""),
      performedBy: req.user.id,
      performedByRole: req.user.role,
      performedByName: req.user.name,
    }).catch((err) => console.error("⚠️ Convert activity log failed:", err));


    return res.status(201).json({
      success: true,
      message: "Query converted to a lead.",
      lead: { id: leadId, name: clean.name, status: "new" },
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rbErr) {
        console.error("⚠️ Rollback failed:", rbErr);
      }
      conn.release();
    }
    console.error("❌ Error converting online query:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to convert this query to a lead.",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — DELETE /api/v1/admin/online-queries/:id  (soft delete)
// ─────────────────────────────────────────────────────────────────────────────
export async function deleteOnlineQuery(req, res) {
  try {
    const query = await OnlineQuery.findByPk(req.params.id);
    if (!query) {
      return res
        .status(404)
        .json({ success: false, message: "Online query not found." });
    }

    await rawDb.query(`UPDATE online_queries SET is_deleted = 1 WHERE id = ?`, [
      query.id,
    ]);

    return res.json({ success: true, message: "Online query deleted." });
  } catch (error) {
    console.error("❌ Error deleting online query:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete online query." });
  }
}
