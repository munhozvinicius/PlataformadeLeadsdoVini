import mongoose, { Document, Model, Schema, models } from "mongoose";
import type { StageId } from "@/constants/stages";

export interface ICompany extends Document {
  empresa: string;
  documento: string;
  vertical: string;
  telefone1?: string;
  telefone2?: string;
  telefone3?: string;
  cidade?: string;
  uf?: string;
  raw?: Record<string, unknown>;
  campaign: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
  stage: StageId;
  isWorked: boolean;
  lastActivityAt?: Date;
  lastOutcomeCode?: string;
  lastOutcomeLabel?: string;
  lastOutcomeNote?: string;
  nextFollowUpAt?: Date;
  nextStepNote?: string;
  fantasia?: string;
  socios?: { nome: string; documento?: string; telefone?: string }[];
  emailsProspeccao?: string[];
  whatsappsProspeccao?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    empresa: { type: String, required: true },
    documento: { type: String, required: true },
    vertical: { type: String, required: true },
    telefone1: { type: String },
    telefone2: { type: String },
    telefone3: { type: String },
    cidade: { type: String },
    uf: { type: String },
    raw: { type: Schema.Types.Mixed },
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    stage: {
      type: String,
      enum: ["NOVO", "EM_CONTATO", "EM_NEGOCIACAO", "FECHADO", "PERDIDO"],
      default: "NOVO",
    },
    isWorked: { type: Boolean, default: false },
    lastActivityAt: { type: Date },
    lastOutcomeCode: { type: String },
    lastOutcomeLabel: { type: String },
    lastOutcomeNote: { type: String },
    nextFollowUpAt: { type: Date },
    nextStepNote: { type: String },
    fantasia: { type: String },
    socios: [
      {
        nome: String,
        documento: String,
        telefone: String,
      },
    ],
    emailsProspeccao: [{ type: String }],
    whatsappsProspeccao: [{ type: String }],
  },
  { timestamps: true }
);

CompanySchema.index({ documento: 1, campaign: 1 }, { unique: true });

const Company: Model<ICompany> =
  models.Company || mongoose.model<ICompany>("Company", CompanySchema);

export default Company;
