// eslint-disable-next-line quotes
import mongoose, { Document, Schema } from "mongoose";
import { IMajorImplementDiscord } from "../discord/implement/major";
import { IVerificationImplementDiscord } from "models/discord/implement/verification";

export interface IGuildStorage extends Document {
  guildId: string;

  majorImplements: Map<string, IMajorImplementDiscord>
  verificationImplement: IVerificationImplementDiscord;
}

export const GuildStorageSchema = new Schema({
  guildId: { type: Schema.Types.String, required: true, unique: true },

  majorImplements: {
    type: Map,
    of: new Schema({
      textCategoryId: { type: Schema.Types.String, required: true, unique: true },
      voiceCategoryId: { type: Schema.Types.String, required: true, unique: true },
      courseImplements: { 
        type: Map, 
        of: new Schema({
          mainRoleId: { type: Schema.Types.String, required: true, unique: true },
          taRoleId: { type: Schema.Types.String, required: true, unique: true },
          mainChannelId: { type: Schema.Types.String, required: true, unique: true },
          voiceChannelId: { type: Schema.Types.String, required: true, unique: true }
        }), 
        required: true, 
        default: {} 
      },
    }),
    required: true,
    default: {}
  },

  verificationImplement: new Schema({
    roleId: { type: Schema.Types.String, required: true, unique: true },
  })
});

GuildStorageSchema.post("init", (_doc) => {
  // TODO: Migrations
});

export const GuildStorage = mongoose.model<IGuildStorage>("GuildStorage", GuildStorageSchema);
