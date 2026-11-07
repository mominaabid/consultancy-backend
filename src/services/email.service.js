import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
export async function sendCounsellorPasswordSetupEmail({
  name,
  email,
  setupLink,
}) {
  try {

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
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          
          <p style="color:#9ca3af; font-size:11px; text-align:center;">
            &copy; ${new Date().getFullYear()} Educatia. All rights reserved.
          </p>
        </div>
      `,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Counsellor email error:", error);
    throw error;
  }
}

export async function sendPasswordSetupEmail({ name, email, setupLink }) {
  try {

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
    return data;
  } catch (error) {
    console.error("❌ Email error:", error);
    throw error;
  }
}

// 🌐 Notify an admin that a new lead just arrived from the Educatia website
export async function sendNewWebsiteLeadEmail({ adminEmail, adminName, lead }) {
  try {

    const reference = `EDU-${lead.id}`;
    const { data, error } = await resend.emails.send({
      from: `"Educatia Website" <${FROM_EMAIL}>`,
      to: adminEmail,
      subject: `🌐 New website lead: ${lead.name}${
        lead.preferred_country ? ` — ${lead.preferred_country}` : ""
      }`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🌐 New Website Lead</h1>
            <p style="color: #ccfbf1; margin: 10px 0 0 0;">Someone just applied via the Educatia website</p>
          </div>

          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hi ${adminName || "there"},</h2>

            <p style="color: #4b5563; line-height: 1.6;">
              A new lead has just been submitted through the Educatia website and is waiting in the <strong>New</strong> stage of the Leads page.
            </p>

            <div style="background: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #0d9488; margin: 0 0 15px 0;">👤 Lead Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>Reference:</strong><td>${reference}</tr>
                <tr><td style="padding: 8px 0;"><strong>Name:</strong><td>${lead.name}</tr>
                <tr><td style="padding: 8px 0;"><strong>Email:</strong><td>${lead.email}</tr>
                <tr><td style="padding: 8px 0;"><strong>Phone:</strong><td>📱 ${lead.phone}</tr>
                <tr><td style="padding: 8px 0;"><strong>Destination:</strong><td>🌍 ${lead.preferred_country || "Not specified"}</tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/adminPanel/leads"
                 style="display: inline-block; background: #0d9488; color: white; padding: 12px 32px;
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📋 Open Leads Page
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to send new website lead email:", error);
    throw error;
  }
}

// 📧 Admins ko batata hai ke website se nayi ONLINE QUERY aayi hai.
// Ye lead nahi hai — admin portal par review karke convert karega.
export async function sendNewOnlineQueryEmail({ adminEmail, adminName, query }) {
  try {

    const reference = `EDU-Q-${query.id}`;
    const { data, error } = await resend.emails.send({
      from: `"Educatia Website" <${FROM_EMAIL}>`,
      to: adminEmail,
      subject: `🌐 New online query: ${query.name}${
        query.preferred_country ? ` — ${query.preferred_country}` : ""
      }`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #2563EB 0%, #1e40af 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">🌐 New Online Query</h1>
            <p style="color: #dbeafe; margin: 10px 0 0 0;">Someone just submitted the Educatia website form</p>
          </div>

          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hi ${adminName || "there"},</h2>

            <p style="color: #4b5563; line-height: 1.6;">
              A new query is waiting in the <strong>Online Queries</strong> page. Review it and convert it to a lead if it looks genuine.
            </p>

            <div style="background: #eff6ff; border-left: 4px solid #2563EB; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #2563EB; margin: 0 0 15px 0;">👤 Query Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>Reference:</strong><td>${reference}</tr>
                <tr><td style="padding: 8px 0;"><strong>Name:</strong><td>${query.name}</tr>
                <tr><td style="padding: 8px 0;"><strong>Email:</strong><td>${query.email}</tr>
                <tr><td style="padding: 8px 0;"><strong>Phone:</strong><td>📱 ${query.phone}</tr>
                <tr><td style="padding: 8px 0;"><strong>Destination:</strong><td>🌍 ${query.preferred_country || "Not specified"}</tr>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong><td>${query.course || "Not specified"}</tr>
              </table>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/admin/online-queries"
                 style="display: inline-block; background: #2563EB; color: white; padding: 12px 32px;
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📋 Open Online Queries
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to send new online query email:", error);
    throw error;
  }
}

// 📧 Confirm receipt to the visitor themselves right after they submit the
// public website lead/consultation form (BotWidget deal card or the full
// Apply Now chat form) — separate from sendNewWebsiteLeadEmail, which only
// notifies internal admins.
export async function sendLeadConfirmationEmail({ to, name, reference }) {
  try {

    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to,
      subject: "We've received your request — Educatia",
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #0d9488;">Thanks, ${name || "there"}!</h2>

          <p style="color: #4b5563; line-height: 1.6;">
            Your request has been submitted successfully.${
              reference ? ` Your reference number is <strong>${reference}</strong>.` : ""
            }
          </p>

          <p style="color: #4b5563; line-height: 1.6;">
            A counsellor will contact you shortly to help with your study-abroad plans.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

          <p style="color:#9ca3af; font-size:11px; text-align:center;">
            &copy; ${new Date().getFullYear()} Educatia. All rights reserved.
          </p>
        </div>
      `,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to send lead confirmation email:", error);
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

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `${name} — Application Submitted to ${university}`,
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
                <tr><td style="padding: 8px 0;"><strong>Applicant:</strong><td>${name}</tr>
                <tr><td style="padding: 8px 0;"><strong>Application ID:</strong><td>#${applicationId}</tr>
                <tr><td style="padding: 8px 0;"><strong>University:</strong><td>🏛️ ${university}</tr>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong><td>📚 ${course}</tr>
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

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `🎉 ${name} — Offer Letter Received from ${university}`,
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
    return data;
  } catch (error) {
    console.error("❌ Failed to send offer received email:", error);
    throw error;
  }
}

export async function sendFeeSubmittedEmail({
  name,
  email,
  university,
  course,
  applicationId,
}) {
  try {

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `${name} — Fee Submitted for ${university}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">💳 Fee Submitted</h1>
            <p style="color: #ccfbf1; margin: 10px 0 0 0;">Your application fee has been recorded</p>
          </div>

          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hello ${name},</h2>

            <p style="color: #4b5563; line-height: 1.6;">
              We've recorded your fee submission for <strong>${course}</strong> at <strong>${university}</strong>.
              Your application is moving forward to the visa filing stage.
            </p>

            <div style="background: #f0fdfa; border-left: 4px solid #0d9488; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #0f766e; margin: 0 0 10px 0;">📋 What's next?</h3>
              <p style="color: #4b5563;margin:0;">Your counsellor will be in touch as your visa filing is prepared.</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/applications"
                 style="display: inline-block; background: #0d9488; color: white; padding: 12px 32px;
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                📋 View Application
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to send fee submitted email:", error);
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

    const { data, error } = await resend.emails.send({
      from: `"Educatia Visas" <${FROM_EMAIL}>`,
      to: email,
      subject: `${name} — Visa Application Filed for ${university}`,
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
                <tr><td style="padding: 8px 0;"><strong>Applicant:</strong><td>${name}</tr>
                <tr><td style="padding: 8px 0;"><strong>University:</strong><td>${university}</tr>
                <tr><td style="padding: 8px 0;"><strong>Course:</strong><td>${course}</td>
                <tr><td style="padding: 8px 0;"><strong>Visa Center:</strong><td>🏢 ${visaCenter || "Your local visa application center"}</td>
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

    const { data, error } = await resend.emails.send({
      from: `"Educatia Visas" <${FROM_EMAIL}>`,
      to: email,
      subject: `🎉 ${name} — Visa Approved for ${university}`,
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

    const { data, error } = await resend.emails.send({
      from: `"Educatia Admissions" <${FROM_EMAIL}>`,
      to: email,
      subject: `${name} — Application Status Update from ${university}`,
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
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 120px;"><strong>Application ID:</strong><td style="padding: 8px 0; color: #1f2937; font-size: 14px;">#${applicationId}</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>University:</strong><td style="padding: 8px 0; color: #1f2937; font-size: 14px;">🏛️ ${university}</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Course:</strong><td style="padding: 8px 0; color: #1f2937; font-size: 14px;">📚 ${course}</tr>
                <tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;"><strong>Submission Date:</strong><td style="padding: 8px 0; color: #1f2937; font-size: 14px;">📅 ${currentDate}</td></tr>
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
    return { success: true, messageId: data.id, sent: true };
  } catch (error) {
    console.error('❌ Chat notification email error:', error);
    return { error: error.message, sent: false };
  }
}

/**
 * Generic "a note was added" notification email — used for both Lead notes
 * (to the assigned counsellor) and Application notes (to the assigned
 * processing officer).
 */
export async function sendNoteAddedEmail({
  recipientName,
  recipientEmail,
  addedByName,
  subjectLabel, // e.g. lead name or "Application #123"
  notePreview,
  portalLink,
}) {
  if (!recipientEmail) {
    console.error('❌ Note notification skipped: No recipient email provided');
    return { error: 'No email', sent: false };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `"Educatia" <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `📝 New note on ${subjectLabel} - Educatia`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #00A78E 0%, #00865F 100%); padding: 24px 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px;">📝 New Note Added</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0 0; font-size: 14px;">${subjectLabel}</p>
          </div>
          <div style="padding: 28px; background: white;">
            <p style="color: #374151; font-size: 15px; margin: 0 0 20px 0;">
              Hello <strong>${recipientName || "there"}</strong> 👋
            </p>
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 20px 0;">
              <strong>${addedByName || "Someone"}</strong> added a note on <strong>${subjectLabel}</strong>:
            </p>
            <div style="background: #f3f4f6; border-left: 4px solid #00A78E; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px 0;">
              <p style="color: #1f2937; font-size: 14px; margin: 0; font-style: italic; line-height: 1.6;">
                "${notePreview ? (notePreview.length >= 160 ? notePreview.substring(0, 160) + '...' : notePreview) : ''}"
              </p>
            </div>
            ${portalLink ? `
            <div style="text-align: center; margin: 24px 0;">
              <a href="${portalLink}" style="display: inline-block; background: #00A78E; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
                View in Portal
              </a>
            </div>` : ""}
          </div>
          <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 11px; margin: 0;">
              © ${new Date().getFullYear()} Educatia
            </p>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    return { success: true, messageId: data.id, sent: true };
  } catch (error) {
    console.error('❌ Note notification email error:', error);
    return { error: error.message, sent: false };
  }
}


// Add these to email.service.js

/**
 * Send debit notification email (when admin charges a fee)
 */
export async function sendDebitNotificationEmail({
  studentName,
  studentEmail,
  applicationDetails,
  invoiceNumber,
  debitedAmount,
  outstandingBalance, // new balance after debit
  transactionDate,
  description,
}) {
  if (!studentEmail) {
    console.error('❌ Debit email skipped: No student email provided');
    return { error: 'No email', sent: false };
  }

  try {
    const formattedAmount = new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(debitedAmount);

    const formattedBalance = new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(outstandingBalance);

    const { data, error } = await resend.emails.send({
      from: `"Educatia Accounts" <${FROM_EMAIL}>`,
      to: studentEmail,
      subject: `Fee Debited - Invoice ${invoiceNumber}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">💰 Fee Debited</h1>
            <p style="color: #fecaca; margin: 10px 0 0 0;">A fee has been charged to your account</p>
          </div>
          
          <div style="padding: 30px; background: white;">
            <h2 style="color: #1f2937;">Hello ${studentName},</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              The following fee has been debited from your account for your application.
            </p>
            
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 12px; margin: 25px 0;">
              <h3 style="color: #dc2626; margin: 0 0 15px 0;">📋 Transaction Details</h3>
              <table style="width: 100%;">
                <tr><td style="padding: 8px 0;"><strong>Invoice Number:</strong></td><td>${invoiceNumber}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Application:</strong></td><td>${applicationDetails}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Debited Amount:</strong></td><td style="color: #dc2626; font-weight: bold;">${formattedAmount}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Outstanding Balance:</strong></td><td>${formattedBalance}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Transaction Date:</strong></td><td>${new Date(transactionDate).toLocaleDateString()}</td></tr>
                ${description ? `<tr><td style="padding: 8px 0;"><strong>Description:</strong></td><td>${description}</td></tr>` : ''}
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/student/accounts" 
                 style="display: inline-block; background: #dc2626; color: white; padding: 12px 32px; 
                        border-radius: 8px; text-decoration: none; font-weight: bold;">
                View Account Statement
              </a>
            </div>
          </div>
        </div>
      `,
    });

    if (error) throw error;
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error('❌ Debit email failed:', error);
    return { error: error.message, sent: false };
  }
}

/**
 * Send credit notification email (when payment received)
 * Sends to both student and all admin users
 */
export async function sendCreditNotificationEmail({
  studentName,
  studentEmail,
  applicationDetails,
  invoiceNumber,
  creditedAmount,
  previousBalance,
  remainingBalance,
  transactionDate,
  description,
  adminEmails, // array of admin email addresses
}) {
  if (!studentEmail) {
    console.error('❌ Credit email skipped: No student email provided');
    return { studentSent: false, adminSent: false };
  }

  const formattedAmount = new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
  }).format(creditedAmount);

  const formattedPrevBalance = new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
  }).format(previousBalance);

  const formattedRemaining = new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
  }).format(remainingBalance);

  const emailHtml = (isAdmin = false) => `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">✅ Payment Received</h1>
        <p style="color: #d1fae5; margin: 10px 0 0 0;">${isAdmin ? `Payment from ${studentName}` : 'Your payment has been recorded'}</p>
      </div>
      
      <div style="padding: 30px; background: white;">
        <h2 style="color: #1f2937;">${isAdmin ? `Payment from ${studentName}` : `Hello ${studentName},`}</h2>
        
        <p style="color: #4b5563; line-height: 1.6;">
          ${isAdmin ? 'A payment has been recorded for the following application.' : 'Your payment has been successfully recorded for your application.'}
        </p>
        
        <div style="background: #ecfdf5; border-left: 4px solid #059669; padding: 20px; border-radius: 12px; margin: 25px 0;">
          <h3 style="color: #059669; margin: 0 0 15px 0;">📋 Transaction Details</h3>
          <table style="width: 100%;">
            <tr><td style="padding: 8px 0;"><strong>Invoice Number:</strong></td><td>${invoiceNumber}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Application:</strong></td><td>${applicationDetails}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Credited Amount:</strong></td><td style="color: #059669; font-weight: bold;">${formattedAmount}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Previous Balance:</strong></td><td>${formattedPrevBalance}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Remaining Balance:</strong></td><td>${formattedRemaining}</td></tr>
            <tr><td style="padding: 8px 0;"><strong>Transaction Date:</strong></td><td>${new Date(transactionDate).toLocaleDateString()}</td></tr>
            ${description ? `<tr><td style="padding: 8px 0;"><strong>Description:</strong></td><td>${description}</td></tr>` : ''}
          </table>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}${isAdmin ? '/admin/accounts' : '/student/accounts'}" 
             style="display: inline-block; background: #059669; color: white; padding: 12px 32px; 
                    border-radius: 8px; text-decoration: none; font-weight: bold;">
            View Account Statement
          </a>
        </div>
      </div>
    </div>
  `;

  const results = { studentSent: false, adminSent: false };

  // Send to student
  try {
    const { data, error } = await resend.emails.send({
      from: `"Educatia Accounts" <${FROM_EMAIL}>`,
      to: studentEmail,
      subject: `Payment Received - Invoice ${invoiceNumber}`,
      html: emailHtml(false),
    });
    if (error) throw error;
    results.studentSent = true;
  } catch (error) {
    console.error('❌ Credit email to student failed:', error);
    results.studentSent = false;
  }

  // Send to all admins
  if (adminEmails && adminEmails.length) {
    for (const adminEmail of adminEmails) {
      try {
        const { data, error } = await resend.emails.send({
          from: `"Educatia Accounts" <${FROM_EMAIL}>`,
          to: adminEmail,
          subject: `Payment Received from ${studentName} - Invoice ${invoiceNumber}`,
          html: emailHtml(true),
        });
        if (error) throw error;
        results.adminSent = true;
      } catch (error) {
        console.error(`❌ Credit email to admin ${adminEmail} failed:`, error);
      }
    }
  }

  return results;
}