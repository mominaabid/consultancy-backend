import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

function emailShell({ preheader = "", bodyHtml }) {
  return `
    <div style="background:#f4f6f8;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:28px 32px;">
          <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">Educatia</span>
        </div>
        <div style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
          ${bodyHtml}
        </div>
        <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #eef0f2;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            This is an automated message from Educatia. If you weren't expecting this email, please contact your administrator.
          </p>
        </div>
      </div>
    </div>
  `;
}

export async function sendProcessingOfficerPasswordSetupEmail({
  name,
  email,
  setupLink,
}) {
  try {

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: email,
      subject: "Welcome to Educatia — set up your processing officer account",
      html: emailShell({
        preheader: `Your Educatia processing officer account is ready, ${name}. Set your password to get started.`,
        bodyHtml: `
          <h2 style="margin:0 0 16px;color:#111827;font-size:19px;">Welcome, ${name} 👋</h2>
          <p style="margin:0 0 16px;">
            An Educatia processing officer account has been created for you. As a processing
            officer, you'll be assigned applications to take through the admissions pipeline —
            from submission through to visa filing. Set your password below to get started.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${setupLink}"
               style="display:inline-block;background:#0d9488;color:#ffffff;
                      padding:13px 32px;border-radius:8px;text-decoration:none;
                      font-weight:600;font-size:14px;">
              Set Your Password
            </a>
          </div>
          <p style="margin:0;color:#6b7280;font-size:13px;">
            This link expires in <strong>24 hours</strong>. If it expires, ask your administrator
            to resend your invitation.
          </p>
        `,
      }),
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Processing officer email error:", error);
    throw error;
  }
}

export async function sendApplicationAssignmentEmail({
  officerEmail,
  officerName,
  application,
  studentName,
  universityName,
  courseName,
}) {
  if (!officerEmail) {
    throw new Error("Processing officer email is missing");
  }

  try {

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: [officerEmail],
      subject: `New application assigned to you — ${studentName || "Student"} (#${application.id})`,
      html: emailShell({
        preheader: `${studentName || "A student"}'s application #${application.id} has been assigned to you.`,
        bodyHtml: `
          <h2 style="margin:0 0 16px;color:#111827;font-size:19px;">Hi ${officerName},</h2>
          <p style="margin:0 0 20px;">A new application has been assigned to you for processing:</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;width:140px;">Student</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;">${studentName || "—"}</td>
            </tr>
            <tr style="border-top:1px solid #f0f1f3;">
              <td style="padding:8px 0;color:#6b7280;">Application</td>
              <td style="padding:8px 0;color:#111827;font-weight:600;">#${application.id}</td>
            </tr>
            <tr style="border-top:1px solid #f0f1f3;">
              <td style="padding:8px 0;color:#6b7280;">University</td>
              <td style="padding:8px 0;color:#111827;">${universityName || "—"}</td>
            </tr>
            <tr style="border-top:1px solid #f0f1f3;">
              <td style="padding:8px 0;color:#6b7280;">Course</td>
              <td style="padding:8px 0;color:#111827;">${courseName || "—"}</td>
            </tr>
            <tr style="border-top:1px solid #f0f1f3;">
              <td style="padding:8px 0;color:#6b7280;">Status</td>
              <td style="padding:8px 0;color:#111827;">${application.status || "—"}</td>
            </tr>
          </table>
          <div style="text-align:center;margin:28px 0 4px;">
            <a href="${process.env.FRONTEND_URL}/processingOfficer/applications"
               style="display:inline-block;background:#0d9488;color:#ffffff;
                      padding:13px 32px;border-radius:8px;text-decoration:none;
                      font-weight:600;font-size:14px;">
              View My Applications
            </a>
          </div>
        `,
      }),
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to send application assignment email:", {
      message: error.message,
      error,
    });
    throw error;
  }
}
