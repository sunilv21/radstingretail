import mongoose from 'mongoose';

/**
 * Mirror of the admin-portal SupportRequest model. Tenants raise tickets
 * here; vendor reads/replies in the admin portal. Both processes share
 * the `supportrequests` collection in MongoDB.
 *
 * Schema kept in lockstep with
 * POS system-admin/server/models/SupportRequest.js. If you change one,
 * change both.
 */
const messageSchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['tenant', 'vendor'], required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    authorName: { type: String, default: '' },
    authorEmail: { type: String, default: '' },
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const supportRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    organizationName: { type: String, default: '' },
    raisedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    raisedByName: { type: String, default: '' },
    raisedByEmail: { type: String, default: '' },
    raisedByRole: { type: String, default: '' },

    type: {
      type: String,
      enum: ['support', 'billing', 'feature', 'bug', 'upgrade', 'general'],
      default: 'support',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true,
    },
    unreadByVendor: { type: Boolean, default: true },
    messages: { type: [messageSchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export const SupportRequest =
  mongoose.models.SupportRequest ||
  mongoose.model('SupportRequest', supportRequestSchema);
export default SupportRequest;
