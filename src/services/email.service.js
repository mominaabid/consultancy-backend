import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  secure: true,
});

export async function sendPasswordSetupEmail({ name, email, setupLink }) {
  try {
    console.log("📧 Sending email to:", email);

    await transporter.verify();
    console.log("✅ Mail server ready");

    const mailOptions = {
      from: `"Educatia" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Set up your Educatia student account",
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
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent:", info.messageId);
    console.log("📨 Full response:", info);

    return info;
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
}