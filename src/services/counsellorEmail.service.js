import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendCounsellorPasswordSetupEmail({
  name,
  email,
  setupLink,
}) {
  try {
    console.log("📧 Sending counsellor email to:", email);

    const mailOptions = {
      from: `"Educatia" <${process.env.EMAIL_USER}>`,
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
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Counsellor email sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Counsellor email error:", error);
    throw error;
  }
}
