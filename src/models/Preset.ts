import mongoose, { Document, Model } from 'mongoose';

export interface IPreset extends Document {
  name: string;
  seederPrompt: string;
  previewImage: string;
  createdAt: Date;
}

const presetSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seederPrompt: { type: String, required: true },
  previewImage: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Preset: Model<IPreset> = mongoose.models.Preset || mongoose.model<IPreset>('Preset', presetSchema);

export default Preset;