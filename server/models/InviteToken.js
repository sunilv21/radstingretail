import mongoose from 'mongoose';

/**
 * Single-use, time-bounded invitation. The token string is what we ship to
 * the invitee (via email/whatsapp). On accept the user sets a password and
 * we mark `usedAt`. Re-using a used or expired token is a hard error.
 */
const inviteTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: '' },
    role: {
      type: String,
      enum: ['admin', 'manager', 'cashier', 'accountant', 'ca'],
      required: true,
    },
    storeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Store' }],
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const InviteToken =
  mongoose.models.InviteToken || mongoose.model('InviteToken', inviteTokenSchema);
export default InviteToken;
