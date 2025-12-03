import { Schema, model, models, Types } from "mongoose";

// Mongoose model kept separado para compatibilidade incremental com coleções existentes.
const importBatchSchema = new Schema(
  {
    campaignId: { type: Types.ObjectId, ref: "Campaign", required: true },
    fileName: { type: String, required: true },
    totalLeads: { type: Number, required: true },
    importedLeads: { type: Number, required: true },
    attributedLeads: { type: Number, default: 0 },
    notAttributedLeads: { type: Number, default: 0 },
    duplicatedLeads: { type: Number, default: 0 },
    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["processing", "completed", "error"],
      default: "completed",
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

export default models.ImportBatch || model("ImportBatch", importBatchSchema);
