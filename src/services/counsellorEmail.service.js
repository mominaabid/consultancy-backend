import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

export async function sendCounsellorPasswordSetupEmail({
  name,
  email,
  setupLink,
}) {
  try {
    console.log("📧 Sending counsellor email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: email,
      subject: "Set up your Educatia counsellor account",
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Welcome to Educatia, ${name}!</h2>
          
          <p>
            Your counsellor account has been created. Click the button below to set your password and access your dashboard.
          </p>

          <a href="${setupLink}" 
             style="display:inline-block; background:#0d9488; color:#fff; 
                    padding:12px 28px; border-radius:8px; text-decoration:none; 
                    font-weight:600; margin:20px 0;">
            Set My Password
          </a>

          <p style="color:#6b7280; font-size:13px;">
            This link expires in <strong>24 hours</strong>.<br>
            If you did not expect this email, please contact your administrator.
          </p>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Counsellor email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Counsellor email error:", error);
    throw error;
  }
}


export async function sendLeadAssignmentEmail({ counsellorEmail, counsellorName, lead }) {
  try {
    console.log(`📧 Sending lead assignment email to counsellor: ${counsellorEmail}`);

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: counsellorEmail,
      subject: `New lead assigned to you: ${lead.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Hello ${counsellorName},</h2>
          
          <p>A new lead has been assigned to you. Here are the details:</p>
          
          <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Name:</td>
              <td style="padding: 8px 0;">${lead.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0;">${lead.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Phone:</td>
              <td style="padding: 8px 0;">${lead.phone || '—'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Preferred Country:</td>
              <td style="padding: 8px 0;">${lead.preferred_country || '—'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Study Level:</td>
              <td style="padding: 8px 0;">${lead.study_level || '—'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Source:</td>
              <td style="padding: 8px 0;">${lead.source || '—'}</td>
            </tr>
          </table>

          <a href="${process.env.FRONTEND_URL}/counsellor/leads" 
             style="display:inline-block; background:#0d9488; color:#fff; 
                    padding:12px 28px; border-radius:8px; text-decoration:none; 
                    font-weight:600; margin:20px 0;">
            View My Leads
          </a>

          <p style="color:#6b7280; font-size:13px;">
            You can manage this lead from your counsellor dashboard.<br>
            If this assignment was unexpected, please contact your administrator.
          </p>
        </div>
      `,
    });

    if (error) throw error;
    console.log(`✅ Lead assignment email sent to ${counsellorEmail}, id: ${data.id}`);
    return data;
  } catch (error) {
    console.error('❌ Failed to send lead assignment email:', error);
    // Don't throw – just log, so the API request doesn’t fail
    return null;
  }
}