import mongoose, { Document, Model, Schema, models } from "mongoose";

export type UserRole = "MASTER" | "OWNER" | "CONSULTOR";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  owner?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["MASTER", "OWNER", "CONSULTOR"], required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const User: Model<IUser> = models.User || mongoose.model<IUser>("User", UserSchema);

export default User;
