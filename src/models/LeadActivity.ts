import mongoose, { Document, Model, Schema, models } from "mongoose";
import type { StageId } from "@/constants/stages";

export type ActivityKind = "CONTATO" | "STATUS" | "NOTA";
export type ActivityChannel = "TELEFONE" | "WHATSAPP" | "EMAIL" | "VISITA" | "OUTRO" | null;

export interface ILeadActivity extends Document {
  company: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  kind: ActivityKind;
  stageBefore: StageId | null;
  stageAfter: StageId | null;
  channel: ActivityChannel;
  outcomeCode?: string;
  outcomeLabel?: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeadActivitySchema = new Schema<ILeadActivity>(
  {
    company: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["CONTATO", "STATUS", "NOTA"], default: "CONTATO" },
    stageBefore: {
      type: String,
      enum: ["PROSPECCAO", "QUALIFICACAO", "REUNIAO", "FECHAMENTO", "GANHO", "PERDIDO", null],
      default: null,
    },
    stageAfter: {
      type: String,
      enum: ["PROSPECCAO", "QUALIFICACAO", "REUNIAO", "FECHAMENTO", "GANHO", "PERDIDO", null],
      default: null,
    },
    channel: {
      type: String,
      enum: ["TELEFONE", "WHATSAPP", "EMAIL", "VISITA", "OUTRO", null],
      default: null,
    },
    outcomeCode: { type: String },
    outcomeLabel: { type: String },
    note: { type: String, required: true },
  },
  { timestamps: true }
);

const LeadActivity: Model<ILeadActivity> =
  models.LeadActivity || mongoose.model<ILeadActivity>("LeadActivity", LeadActivitySchema);

export default LeadActivity;
