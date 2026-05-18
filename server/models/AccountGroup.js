import mongoose from 'mongoose';

const accountGroupSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', default: null },
    nature: { type: String, enum: ['asset', 'liability', 'income', 'expense'], required: true },
  },
  { timestamps: true },
);

accountGroupSchema.index({ storeId: 1, name: 1 });

export const AccountGroup = mongoose.models.AccountGroup || mongoose.model('AccountGroup', accountGroupSchema);
export default AccountGroup;
