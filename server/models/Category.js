import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    name: { type: String, required: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  },
  { timestamps: true },
);

categorySchema.index({ storeId: 1, name: 1 });

export const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);
export default Category;
