import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordSetupEmail({ name, email, setupLink }) {
  try {
    console.log("📧 Sending email to:", email);

    const response = await resend.emails.send({
      from: "onboarding@resend.dev",
    //   to: email,                    // ✅ variable not string "lead.email"
    //   subject: "Set up your Educatia student account",
     to: 'mominaabid789@gmail.com',  // ← your Resend account email for testing
  subject: 'Set up your Educatia student account',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Welcome to Educatia, ${name}!</h2>
          <p>Your counsellor has moved your application forward. Click below to set your password.</p>
          <a href="${setupLink}" 
             style="display:inline-block; background:#0d9488; color:#fff; 
                    padding:12px 28px; border-radius:8px; text-decoration:none; 
                    font-weight:600; margin:20px 0;">
            Set My Password
          </a>
          <p style="color:#6b7280; font-size:13px;">
            This link expires in <strong>24 hours</strong>.<br>
            If you didn't expect this, ignore it.
          </p>
        </div>
      `,
    });

    console.log("✅ Email sent:", response);
    return response;
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
}