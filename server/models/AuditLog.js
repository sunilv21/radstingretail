import mongoose from 'mongoose';

/**
 * Immutable record of every sensitive action. Append-only — the route
 * doesn't expose UPDATE or DELETE. Powers the admin audit-log viewer and
 * the CA portal's "your accountant pulled GSTR-1 on May 3" trail.
 */
const auditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userEmail: String,
    userRole: String,

    /** HTTP method + URL the user hit. */
    method: String,
    path: String,
    /** Resource group inferred from the URL ('sales', 'gst', …). */
    resource: String,
    /** Coarse action: 'create' | 'update' | 'delete' | 'read' | 'export'. */
    action: String,
    /** Body of the response status. */
    statusCode: Number,
    /** Hand-written summary, e.g. "Generated GSTR-1 for 2026-04". */
    summary: String,
    /** Sanitised request body. Pii is redacted by the writer. */
    payload: mongoose.Schema.Types.Mixed,

    ip: String,
    userAgent: String,
    durationMs: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });

export const AuditLog =
  mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
