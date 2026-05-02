import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

export async function sendPasswordSetupEmail({ name, email, setupLink }) {
  try {
    console.log("📧 Sending email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
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
    });

    if (error) throw error;
    console.log("✅ Email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
}

export async function sendApplicationInquiryEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending inquiry email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Inquiry Started - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">📋 Application Inquiry</h1>
            <p style="color: #ccfbf1; margin: 10px 0 0 0;">Your application process has begun!</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hello ${name}! 👋</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              We're pleased to inform you that your counsellor has initiated the application inquiry process for your study abroad journey.
            </p>
            
            <div style="background: #f0fdf4; border-left: 4px solid #0d9488; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #0d9488; margin: 0 0 15px 0;">📋 Application Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>Application ID:</strong>NonNull<td>#${applicationId}NonNull</tr>
                <tr><td style="padding: 8px 0;"><strong>University:</strong>NonNull<td>🏛️ ${university}NonNull</td>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong>NonNull<td>📚 ${course}NonNull</tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications" 
                 style="display: inline-block; background: #0d9488; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                🔗 Track Your Application
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Inquiry email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send inquiry email:", error);
    throw error;
  }
}

export async function sendApplicationEvaluationEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending evaluation email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Under Evaluation - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🔍 Application Under Evaluation</h1>
            <p style="color: #fef3c7; margin: 10px 0 0 0;">Your application is being reviewed!</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hello ${name}! 👋</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              Great news! Your application for <strong>${course}</strong> at <strong>${university}</strong> is now under evaluation. Our team is carefully reviewing your documents and qualifications.
            </p>
            
            <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #d97706; margin: 0 0 15px 0;">⏳ What's Next?</h3>
              <ul style="color: #4b5563;">
                <li>📄 Document verification in progress</li>
                <li>💬 Counsellor will contact you for any additional requirements</li>
                <li>📊 You'll receive updates within 2-3 business days</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications" 
                 style="display: inline-block; background: #f59e0b; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                🔍 Check Status
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Evaluation email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send evaluation email:", error);
    throw error;
  }
}

export async function sendApplicationSubmittedEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending application submitted email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Submitted to University - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">✅ Application Submitted!</h1>
            <p style="color: #dbeafe; margin: 10px 0 0 0;">Your application has been sent to the university</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Congratulations ${name}! 🎉</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              Your application for <strong>${course}</strong> at <strong>${university}</strong> has been successfully submitted. We're now waiting for the university's response.
            </p>
            
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0;">📋 Submission Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>Application ID:</strong>NonNull<td>#${applicationId}NonNull</tr>
                <tr><td style="padding: 8px 0;"><strong>University:</strong>NonNull<td>🏛️ ${university}NonNull</tr>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong>NonNull<td>📚 ${course}NonNull</tr>
              </table>
            </div>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                ⏰ University response typically takes 4-6 weeks. We'll notify you as soon as we hear back!
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications" 
                 style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📊 Track Progress
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Application submitted email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send application submitted email:", error);
    throw error;
  }
}

export async function sendOfferReceivedEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending offer received email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `🎉 Offer Letter Received - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎉 Congratulations!</h1>
            <p style="color: #d1fae5; margin: 10px 0 0 0;">You've received an offer letter!</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Dear ${name},</h2>
            
            <p style="color: #4b5563; line-height: 1.6; font-size: 18px; font-weight: bold;">
              🎊 Amazing news! You've received an offer letter from <strong>${university}</strong> for <strong>${course}</strong>!
            </p>
            
            <div style="background: #ecfdf5; border: 2px solid #10b981; padding: 20px; border-radius: 12px; margin: 25px 0; text-align: center;">
              <p style="color: #065f46; font-size: 16px; margin: 0;">
                📧 Your offer letter has been sent to your registered email address.
              </p>
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0;">📝 Next Steps:</h3>
              <ul style="color: #4b5563;">
                <li>✅ Review your offer letter carefully</li>
                <li>💰 Review tuition fees and scholarship details</li>
                <li>✉️ Contact your counsellor to discuss the offer</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications" 
                 style="display: inline-block; background: #10b981; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📋 View Offer Details
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Offer received email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send offer received email:", error);
    throw error;
  }
}

export async function sendOfferNotReceivedEmail({
  name,
  email,
  university,
  course,
  applicationId,
  reason = "The university is still processing applications",
}) {
  try {
    console.log("📧 Sending offer not received email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Status Update - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">⏳ Application Update</h1>
            <p style="color: #fed7aa; margin: 10px 0 0 0;">Offer letter status update</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hello ${name},</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              We wanted to update you on your application for <strong>${course}</strong> at <strong>${university}</strong>.
            </p>
            
            <div style="background: #fff7ed; border-left: 4px solid #f97316; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #ea580c; margin: 0 0 15px 0;">📋 Current Status</h3>
              <p style="color: #4b5563;">We haven't received an offer letter yet. ${reason}</p>
            </div>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #374151; margin: 0 0 10px 0;">🔄 What happens now?</h3>
              <ul style="color: #4b5563;">
                <li>📞 Your counsellor is following up with the university</li>
                <li>📊 We'll update you as soon as we receive any response</li>
                <li>💡 Consider applying to more universities as backup options</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="mailto:${process.env.RESEND_FROM_EMAIL}" 
                 style="display: inline-block; background: #f97316; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📧 Contact Counsellor
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Offer not received email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send offer not received email:", error);
    throw error;
  }
}

export async function sendVisaFiledEmail({
  name,
  email,
  university,
  course,
  applicationId,
  visaCenter,
}) {
  try {
    console.log("📧 Sending visa filed email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Visas" <${FROM_EMAIL}>`,
      to: email,
      subject: `Visa Application Filed - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">✈️ Visa Application Filed</h1>
            <p style="color: #ede9fe; margin: 10px 0 0 0;">Your visa application has been submitted!</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Dear ${name},</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              Great news! Your student visa application for <strong>${university}</strong> has been filed successfully.
            </p>
            
            <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #7c3aed; margin: 0 0 15px 0;">📋 Visa Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>University:</strong>NonNull<td>${university}NonNull</tr>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong>NonNull<td>${course}NonNull</td>
                <tr><td style="padding: 8px 0;"><strong>Visa Center:</strong>NonNull<td>🏢 ${visaCenter || "Your local visa application center"}NonNull</td>
              </table>
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #d97706; margin: 0 0 10px 0;">⏰ Visa Processing Timeline:</h3>
              <ul style="color: #4b5563;">
                <li>📅 Standard processing: 2-4 weeks</li>
                <li>⚡ Priority processing: 5-10 working days (if available)</li>
                <li>📞 You may be called for an interview</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications" 
                 style="display: inline-block; background: #8b5cf6; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                🔍 Track Visa Status
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Visa filed email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send visa filed email:", error);
    throw error;
  }
}

export async function sendVisaApprovedEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending visa approved email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Visas" <${FROM_EMAIL}>`,
      to: email,
      subject: `🎉 Visa Approved! - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🎊 VISA APPROVED! 🎊</h1>
            <p style="color: #d1fae5; margin: 10px 0 0 0;">Congratulations! Your student visa has been approved</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <div style="text-align: center; margin-bottom: 25px;">
              <div style="font-size: 48px;">🎓✈️🌍</div>
            </div>
            
            <h2 style="color: #1f2937;">Dear ${name},</h2>
            
            <p style="color: #4b5563; line-height: 1.6; font-size: 18px;">
              🎉 <strong>Outstanding news!</strong> Your student visa for <strong>${university}</strong> has been <strong style="color: #059669;">APPROVED</strong>!
            </p>
            
            <div style="background: #ecfdf5; border: 2px solid #059669; padding: 20px; border-radius: 12px; margin: 25px 0; text-align: center;">
              <p style="color: #065f46; font-size: 16px;">
                🛂 Your visa is ready! You can now make travel arrangements.
              </p>
            </div>
            
            <div style="background: #dbeafe; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #1e40af; margin: 0 0 15px 0;">✈️ Next Steps - Pre-departure Checklist:</h3>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>📅 Book your flight tickets</li>
                <li>🏠 Arrange accommodation</li>
                <li>💰 Open a bank account (if needed)</li>
                <li>🩺 Complete medical checkup</li>
                <li>📦 Pack essentials</li>
                <li>🎒 Attend pre-departure orientation</li>
              </ul>
            </div>
            
            <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #92400e; margin: 0;">
                📞 Your counsellor will contact you with detailed pre-departure guidance.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/dashboard" 
                 style="display: inline-block; background: #059669; color: white; padding: 14px 36px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                🎓 Start Your Journey
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Visa approved email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send visa approved email:", error);
    throw error;
  }
}

export async function sendApplicationRejectedEmail({
  name,
  email,
  university,
  course,
  applicationId,
  reason,
}) {
  try {
    console.log("📧 Sending application rejected email to:", email);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Status Update - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">📢 Application Update</h1>
            <p style="color: #fecaca; margin: 10px 0 0 0;">Important update regarding your application</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Dear ${name},</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              We want to inform you that your application for <strong>${course}</strong> at <strong>${university}</strong> has not been successful at this time.
            </p>
            
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #dc2626; margin: 0 0 15px 0;">📋 Reason:</h3>
              <p style="color: #4b5563;">${reason || "The application did not meet the university's requirements at this time."}</p>
            </div>
            
            <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #2563eb; margin: 0 0 15px 0;">💡 Don't Give Up! Here's what you can do:</h3>
              <ul style="color: #4b5563; line-height: 1.8;">
                <li>📚 Consider applying to other universities</li>
                <li>📖 Strengthen your application (improve test scores, gain experience)</li>
                <li>💬 Schedule a meeting with your counsellor to discuss alternatives</li>
                <li>🔄 You can reapply in the next intake</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="mailto:${process.env.RESEND_FROM_EMAIL}" 
                 style="display: inline-block; background: #dc2626; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📧 Discuss Alternatives with Counsellor
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Application rejected email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send rejection email:", error);
    throw error;
  }
}

export async function sendApplicationConfirmationEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {
    console.log("📧 Sending application confirmation email to:", email);

    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `Application Created Successfully - ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">🎓 Application Created!</h1>
            <p style="color: #ccfbf1; margin: 10px 0 0 0;">Your journey to studying abroad begins here</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">
              Hello ${name}! 👋
            </h2>
            
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
              We're excited to inform you that your application has been successfully created in our system. 
              Our team will review your application and guide you through the admission process.
            </p>
            
            <div style="background: #f0fdf4; border-left: 4px solid #0d9488; padding: 20px; border-radius: 12px; margin-bottom: 25px;">
              <h3 style="color: #0d9488; margin: 0 0 15px 0; font-size: 18px;">📋 Application Details</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;"><strong>Application ID:</strong>NonNull<td style="padding: 8px 0; color: #1f2937; font-size: 14px;">#${applicationId}NonNull</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>University:</strong>NonNull<td style="padding: 8px 0; color: #1f2937; font-size: 14px;">🏛️ ${university}NonNull</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Course:</strong>NonNull<td style="padding: 8px 0; color: #1f2937; font-size: 14px;">📚 ${course}NonNull</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Submission Date:</strong>NonNull<td style="padding: 8px 0; color: #1f2937; font-size: 14px;">📅 ${currentDate}</td></tr>
              </table>
            </div>
            
            <div style="margin-bottom: 25px;">
              <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">📝 Next Steps</h3>
              <ul style="color: #4b5563; line-height: 1.8; padding-left: 20px; margin: 0;">
                <li>📄 Complete your document verification process</li>
                <li>✉️ Check your email regularly for status updates</li>
                <li>💬 Our counsellor will contact you within 24-48 hours</li>
                <li>📊 Track your application progress in your dashboard</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || "http://localhost:5173"}/student/applications" 
                 style="display: inline-block; background: #0d9488; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                🔗 View My Application
              </a>
            </div>
            
            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin-top: 20px;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                📧 Need help? Contact us at ${process.env.RESEND_FROM_EMAIL}<br>
                ⏰ Response time: Within 24 hours
              </p>
            </div>
          </div>
          
          <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              &copy; ${new Date().getFullYear()} Educatia. All rights reserved.<br>
              Empowering students to achieve their study abroad dreams.
            </p>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log("✅ Application confirmation email sent:", data.id);
    return data;
  } catch (error) {
    console.error("❌ Failed to send application confirmation email:", error);
    throw error;
  }
}

export async function sendChatNotificationEmail({
  recipientName,
  recipientEmail,
  senderName,
  senderRole,
  messagePreview,
  conversationId,
}) {
  if (!recipientEmail) {
    console.error('❌ Chat notification skipped: No recipient email provided');
    return { error: 'No email', sent: false };
  }

  if (!recipientName) recipientName = "User";

  try {
    const isStudent = senderRole === 'counsellor';
    const portalLink = isStudent
      ? `${process.env.FRONTEND_URL}/student/chat`
      : `${process.env.FRONTEND_URL}/counsellor/chats`;

    const themeColor = isStudent ? '#0d9488' : '#7c3aed';
    const senderLabel = senderRole === 'counsellor' ? 'Your Counsellor' : 'Your Student';

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `💬 New message from ${senderName} - Educatia`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          
          <div style="background: linear-gradient(135deg, ${themeColor} 0%, ${themeColor}cc 100%); padding: 24px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">💬 New Message</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0; font-size: 14px;">
              You have a new message from ${senderLabel}
            </p>
          </div>

          <div style="padding: 28px; background: white;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px 0;">
              Hello <strong>${recipientName}</strong> 👋
            </p>

            <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0;">
              <strong>${senderName}</strong> sent you a message on Educatia:
            </p>

            <div style="background: #f3f4f6; border-left: 4px solid ${themeColor}; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px 0;">
              <p style="color: #1f2937; font-size: 14px; margin: 0; font-style: italic; line-height: 1.6;">
                "${messagePreview ? (messagePreview.length >= 100 ? messagePreview.substring(0, 100) + '...' : messagePreview) : 'No message preview available'}"
              </p>
            </div>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${portalLink}"
                 style="display: inline-block; background: ${themeColor}; color: white; 
                        padding: 12px 32px; border-radius: 8px; text-decoration: none; 
                        font-weight: bold; font-size: 15px;">
                💬 Reply Now
              </a>
            </div>

            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              Log in to your Educatia portal to view and reply to this message.
            </p>
          </div>

          <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0;">
              © ${new Date().getFullYear()} Educatia · You received this because someone messaged you on the platform.
            </p>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    console.log(`✅ Chat notification sent to ${recipientEmail}:`, data.id);
    return { success: true, messageId: data.id, sent: true };
  } catch (error) {
    console.error('❌ Chat notification email error:', error);
    return { error: error.message, sent: false };
  }
}