import mongoose, { Document, Model, Schema, models } from "mongoose";

export interface ICampaign extends Document {
  name: string;
  description?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignSchema = new Schema<ICampaign>(
  {
    name: { type: String, required: true },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

const Campaign: Model<ICampaign> =
  models.Campaign || mongoose.model<ICampaign>("Campaign", CampaignSchema);

export default Campaign;
