// Single source of truth for the Application status pipeline.
// Old pipeline (inquiry/evaluation/offer letter received.../reject) was retired —
// see lead_application_status_sync_migration.sql and the Phase 3 status migration.
export const APPLICATION_STATUSES = [
  "application submitted",
  "offer letter",
  "fee submitted",
  "visa filed",
  "approved",
  "rejected",
];

export const APPLICATION_STATUS_DATE_MAP = {
  "application submitted": "application_submitted_date",
  "offer letter": "offer_letter_date",
  "fee submitted": "fee_submitted_date",
  "visa filed": "visa_filed_date",
  approved: "approved_date",
  rejected: "reject_date",
};

export const APPLICATION_STATUS_DISPLAY_MAP = {
  "application submitted": "Application Submitted",
  "offer letter": "Offer Letter",
  "fee submitted": "Fee Submitted",
  "visa filed": "Visa Filed",
  approved: "Approved",
  rejected: "Rejected",
};
