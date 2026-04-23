// import { Router } from "express";
// import { Resend } from "resend";

// const router = Router();

// const resend = new Resend(process.env.RESEND_API_KEY);

// // TEST EMAIL ROUTE
// router.get("/email", async (req, res) => {
//   try {
//     console.log("📤 Test email route hit");

//     const response = await resend.emails.send({
//       from: "onboarding@resend.dev",
//       to: "mominaabid789@gmail.com", // must be your verified email
//       subject: "Test Email",
//       html: "<h1>🎉 Email Works!</h1>",
//     });

//     console.log("✅ Resend response:", response);

//     res.json({ success: true, response });

//   } catch (error) {
//     console.error("❌ Email error:", error);
//     res.status(500).json({ success: false, error });
//   }
// });

// export default router;