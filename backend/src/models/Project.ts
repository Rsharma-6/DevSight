import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description?: string;
  apiKey: string;
  githubRepo?: string;
  createdAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    githubRepo: { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IProject>('Project', ProjectSchema);
