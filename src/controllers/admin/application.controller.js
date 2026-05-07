import Application from "../../models/mysql/Application.js";
import Lead from "../../models/mysql/Lead.js";
import Document from "../../models/mysql/Document.js";
import { Sequelize } from "sequelize";
import { Op } from "sequelize";

// Progress mapping for new status enum
const STATUS_PROGRESS = {
  inquiry: 10,
  evaluation: 25,
  "application submitted": 40,
  "offer letter received": 60,
  "offer letter not received": 50,
  "visa filed": 75,
  approved: 100,
  reject: 100,
};

// Helper function to calculate progress
const calculateProgress = (application) => {
  return STATUS_PROGRESS[application.status] || 0;
};

// Get all applications (for admin)
export const getAllApplications = async (req, res) => {
  try {
    // Fetch all applications ordered by latest first
    const applications = await Application.findAll({
      order: [["created_at", "DESC"]],
    });

    // Transform the data to match the frontend expectations
    const transformedApps = applications.map((app) => ({
      id: app.id,
      application_id: app.id.toString(),
      student_name:
        app.full_name ||
        `${app.first_name || ""} ${app.last_name || ""}`.trim(),
      first_name: app.first_name,
      last_name: app.last_name,
      email: app.email,
      phone: app.phone,
      country: app.country,
      nationality: app.nationality,
      target_university: app.target_university,
      course: app.course,
      status: app.status || "inquiry",
      progress: calculateProgress(app),
      created_at: app.created_at,
      updated_at: app.updated_at,
    }));

    res.json(transformedApps);
  } catch (err) {
    console.error("Error fetching all applications:", err);
    res.status(500).json({ message: "Error fetching applications" });
  }
};

// Example: controllers/admin/user.controller.js
export const getAllStudents = async (req, res) => {
  try {
    // Adjust attributes to match your actual users table columns
    const students = await Lead.findAll({
      where: {
        status: {
          [Op.in]: ["new", "contacted", "counseling"],
        },
      },
      attributes: ["id", "name", "email", "phone"], // Use 'name' instead of first_name/last_name
      order: [["name", "ASC"]], // Order by name
    });

    const formatted = students.map((s) => ({
      id: s.id,
      user_id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
    }));

    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching students" });
  }
};
// Create new application by admin
// Create new application by admin (FIXED)
export const createApplicationByAdmin = async (req, res) => {
  try {
    const {
      user_id, // <-- now used
      first_name,
      last_name,
      email,
      phone,
      country,
      nationality,
      target_university,
      course,
      status,
      dob,
      gender,
      cnic,
      passport_number,
      last_degree,
      institute,
      cgpa,
      passing_year,
      english_test,
      test_score,
      target_country,
      counselor_notes,
    } = req.body;

    // Validate required fields
    if (!user_id) {
      return res.status(400).json({ message: "user_id is required" });
    }
    if (
      (!first_name && !last_name) ||
      !email ||
      !target_university ||
      !course
    ) {
      return res.status(400).json({
        message:
          "Missing required fields: first_name/last_name, email, target_university, course",
      });
    }

    // Build full_name for the Application model
    const full_name = `${first_name || ""} ${last_name || ""}`.trim();

    const allowedStatuses = [
      "inquiry",
      "evaluation",
      "application submitted",
      "offer letter received",
      "offer letter not received",
      "visa filed",
      "approved",
      "reject",
    ];
    const finalStatus =
      status && allowedStatuses.includes(status) ? status : "inquiry";

    // Map status to date column for initial tracking
    const statusDateMap = {
      inquiry: "inquiry_date",
      evaluation: "evaluation_date",
      "application submitted": "application_submitted_date",
      "offer letter received": "offer_received_date",
      "offer letter not received": "offer_not_received_date",
      "visa filed": "visa_filed_date",
      approved: "approved_date",
      reject: "reject_date",
    };

    const updateData = {
      user_id, // <-- include the user_id
      full_name,
      first_name,
      last_name,
      email,
      phone,
      country,
      nationality,
      target_university,
      course,
      status: finalStatus,
      dob,
      gender,
      cnic,
      passport_number,
      last_degree,
      institute,
      cgpa,
      passing_year,
      english_test,
      test_score,
      target_country,
      counselor_notes,
    };

    // Set the appropriate date field for the initial status
    if (statusDateMap[finalStatus]) {
      updateData[statusDateMap[finalStatus]] = new Date();
    }

    const newApplication = await Application.create(updateData);

    // Transform response
    const responseData = {
      id: newApplication.id,
      application_id: newApplication.id.toString(),
      student_name: newApplication.full_name,
      first_name: newApplication.first_name,
      last_name: newApplication.last_name,
      email: newApplication.email,
      phone: newApplication.phone,
      country: newApplication.country,
      nationality: newApplication.nationality,
      target_university: newApplication.target_university,
      course: newApplication.course,
      status: newApplication.status,
      progress: calculateProgress(newApplication),
      created_at: newApplication.created_at,
      updated_at: newApplication.updated_at,
    };

    res.status(201).json(responseData);
  } catch (err) {
    console.error("Error creating application:", err);
    if (err.name === "SequelizeValidationError") {
      return res
        .status(400)
        .json({ message: err.errors.map((e) => e.message).join(", ") });
    }
    res.status(500).json({ message: "Error creating application" });
  }
};

// Update application status (admin)
export const updateApplicationStatusByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status against allowed enum values
    const allowedStatuses = [
      "inquiry",
      "evaluation",
      "application submitted",
      "offer letter received",
      "offer letter not received",
      "visa filed",
      "approved",
      "reject",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const statusDateMap = {
      inquiry: "inquiry_date",
      evaluation: "evaluation_date",
      "application submitted": "application_submitted_date",
      "offer letter received": "offer_received_date",
      "offer letter not received": "offer_not_received_date",
      "visa filed": "visa_filed_date",
      approved: "approved_date",
      reject: "reject_date",
    };

    const updateData = { status };
    if (statusDateMap[status]) {
      updateData[statusDateMap[status]] = new Date();
    }

    const [updated] = await Application.update(updateData, {
      where: { id },
      individualHooks: true,
    });

    if (updated) {
      const updatedApplication = await Application.findByPk(id);
      // Calculate progress for the response
      const responseData = updatedApplication.toJSON();
      responseData.progress = calculateProgress(updatedApplication);
      res.json(responseData);
    } else {
      res.status(404).json({ message: "Application not found" });
    }
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ message: "Error updating status" });
  }
};

// Get application by ID with documents (admin)
export const getApplicationById = async (req, res) => {
  try {
    const { id } = req.params;

    const application = await Application.findByPk(id);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Fetch documents associated with this application
    const documents = await Document.findAll({
      where: { application_id: id },
      attributes: [
        "id",
        "doc_type",
        "file_path",
        "status",
        "uploaded_at",
        "rejection_reason",
        "reviewed_at",
      ],
      order: [["uploaded_at", "DESC"]],
    });

    // Transform documents to match frontend expectations
    const transformedDocuments = documents.map((doc) => ({
      id: doc.id,
      doc_type: doc.doc_type,
      file_url: doc.file_path,
      status: doc.status,
      submitted_at: doc.uploaded_at,
      rejection_reason: doc.rejection_reason,
      reviewed_at: doc.reviewed_at,
    }));

    // Calculate document statistics
    const totalDocuments = 8;
    const uploadedCount = documents.length;
    const verifiedCount = documents.filter(
      (doc) => doc.status === "verified",
    ).length;
    const pendingCount = documents.filter(
      (doc) => doc.status === "pending",
    ).length;
    const rejectedCount = documents.filter(
      (doc) => doc.status === "rejected",
    ).length;
    const reviewCount = documents.filter(
      (doc) => doc.status === "review",
    ).length;

    const transformedApp = {
      id: application.id,
      application_id: application.id.toString(),
      student_name:
        application.full_name ||
        `${application.first_name || ""} ${application.last_name || ""}`.trim(),
      first_name: application.first_name,
      last_name: application.last_name,
      email: application.email,
      phone: application.phone,
      country: application.country,
      nationality: application.nationality,
      target_university: application.target_university,
      course: application.course,
      status: application.status || "inquiry",
      progress: calculateProgress(application),
      created_at: application.created_at,
      updated_at: application.updated_at,
      submission_date: application.application_submitted_date,

      // Document information
      documents: transformedDocuments,
      total_documents: totalDocuments,
      uploaded_documents: uploadedCount,
      verified_documents: verifiedCount,
      pending_documents: pendingCount,
      rejected_documents: rejectedCount,
      review_documents: reviewCount,

      // Additional student info
      dob: application.dob,
      age: application.age,
      gender: application.gender,
      cnic: application.cnic,
      passport_number: application.passport_number,
      profile_picture: application.profile_picture,

      // Academic info
      last_degree: application.last_degree,
      institute: application.institute,
      cgpa: application.cgpa,
      passing_year: application.passing_year,
      english_test: application.english_test,
      test_score: application.test_score,

      // Other info
      target_country: application.target_country,
      counselor_notes: application.counselor_notes,

      // Status dates
      inquiry_date: application.inquiry_date,
      evaluation_date: application.evaluation_date,
      application_submitted_date: application.application_submitted_date,
      offer_received_date: application.offer_received_date,
      offer_not_received_date: application.offer_not_received_date,
      visa_filed_date: application.visa_filed_date,
      approved_date: application.approved_date,
      reject_date: application.reject_date,
    };

    res.json(transformedApp);
  } catch (err) {
    console.error("Error fetching application details:", err);
    res.status(500).json({ message: "Error fetching application details" });
  }
};

// Get applications statistics (admin dashboard)
export const getApplicationsStats = async (req, res) => {
  try {
    const stats = await Application.findAll({
      attributes: [
        "status",
        [Sequelize.fn("COUNT", Sequelize.col("status")), "count"],
      ],
      group: ["status"],
    });

    const total = await Application.count();

    // Get document statistics
    const documentStats = await Document.findAll({
      attributes: [
        "status",
        [Sequelize.fn("COUNT", Sequelize.col("status")), "count"],
      ],
      group: ["status"],
    });

    const docStats = {
      total: await Document.count(),
      verified: 0,
      pending: 0,
      rejected: 0,
      review: 0,
    };

    documentStats.forEach((stat) => {
      if (stat.status === "verified") docStats.verified = stat.dataValues.count;
      else if (stat.status === "pending")
        docStats.pending = stat.dataValues.count;
      else if (stat.status === "rejected")
        docStats.rejected = stat.dataValues.count;
      else if (stat.status === "review")
        docStats.review = stat.dataValues.count;
    });

    // Create a map for easy access
    const statusMap = {};
    stats.forEach((stat) => {
      statusMap[stat.status] = stat.dataValues.count;
    });

    res.json({
      total,
      breakdown: stats,
      documentStats: docStats,
      statusMap: {
        inquiry: statusMap.inquiry || 0,
        evaluation: statusMap.evaluation || 0,
        "application submitted": statusMap["application submitted"] || 0,
        "offer letter received": statusMap["offer letter received"] || 0,
        "offer letter not received":
          statusMap["offer letter not received"] || 0,
        "visa filed": statusMap["visa filed"] || 0,
        approved: statusMap.approved || 0,
        reject: statusMap.reject || 0,
      },
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ message: "Error fetching statistics" });
  }
};

// Get applications by status filter
export const getApplicationsByStatus = async (req, res) => {
  try {
    const { status } = req.params;

    // Validate status
    const allowedStatuses = [
      "inquiry",
      "evaluation",
      "application submitted",
      "offer letter received",
      "offer letter not received",
      "visa filed",
      "approved",
      "reject",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const applications = await Application.findAll({
      where: { status },
      order: [["created_at", "DESC"]],
    });

    const transformedApps = applications.map((app) => ({
      id: app.id,
      application_id: app.id.toString(),
      student_name:
        app.full_name ||
        `${app.first_name || ""} ${app.last_name || ""}`.trim(),
      email: app.email,
      phone: app.phone,
      target_university: app.target_university,
      course: app.course,
      status: app.status,
      progress: calculateProgress(app),
      created_at: app.created_at,
      updated_at: app.updated_at,
    }));

    res.json(transformedApps);
  } catch (err) {
    console.error("Error fetching applications by status:", err);
    res.status(500).json({ message: "Error fetching applications" });
  }
};

// Update document status (admin)
export const updateDocumentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejection_reason } = req.body;
    const adminId = req.user?.id;

    const updateData = {
      status,
      reviewed_by: adminId,
      reviewed_at: new Date(),
    };

    if (rejection_reason && status === "rejected") {
      updateData.rejection_reason = rejection_reason;
    }

    const [updated] = await Document.update(updateData, {
      where: { id },
    });

    if (updated) {
      const updatedDocument = await Document.findByPk(id);
      res.json(updatedDocument);
    } else {
      res.status(404).json({ message: "Document not found" });
    }
  } catch (err) {
    console.error("Error updating document status:", err);
    res.status(500).json({ message: "Error updating document status" });
  }
};

// Get all documents for an application
export const getApplicationDocuments = async (req, res) => {
  try {
    const { id } = req.params;

    const documents = await Document.findAll({
      where: { application_id: id },
      order: [["doc_type", "ASC"]],
    });

    res.json(documents);
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).json({ message: "Error fetching documents" });
  }
};

// Optional: Bulk update status
export const bulkUpdateApplicationStatus = async (req, res) => {
  try {
    const { applicationIds, status } = req.body;

    const allowedStatuses = [
      "inquiry",
      "evaluation",
      "application submitted",
      "offer letter received",
      "offer letter not received",
      "visa filed",
      "approved",
      "reject",
    ];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({ message: "Invalid application IDs" });
    }

    const statusDateMap = {
      inquiry: "inquiry_date",
      evaluation: "evaluation_date",
      "application submitted": "application_submitted_date",
      "offer letter received": "offer_received_date",
      "offer letter not received": "offer_not_received_date",
      "visa filed": "visa_filed_date",
      approved: "approved_date",
      reject: "reject_date",
    };

    const updateData = { status };
    if (statusDateMap[status]) {
      updateData[statusDateMap[status]] = new Date();
    }

    const [updatedCount] = await Application.update(updateData, {
      where: { id: applicationIds },
    });

    res.json({
      message: `Successfully updated ${updatedCount} applications`,
      updatedCount,
    });
  } catch (err) {
    console.error("Error bulk updating status:", err);
    res.status(500).json({ message: "Error updating applications" });
  }
};
