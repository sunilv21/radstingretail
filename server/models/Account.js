import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountGroup', required: true },
    openingBalance: { type: Number, default: 0 },
  },
  { timestamps: true },
);

accountSchema.index({ storeId: 1, groupId: 1 });
accountSchema.index({ storeId: 1, name: 1 });

export const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
export default Account;
