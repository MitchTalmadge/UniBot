import { Course } from "src/models/course";
import { CourseChannelImplementDiscordService } from "./channel";
import { CourseRoleImplementDiscordService } from "./role";
import { GuildContext } from "src/guild-context";
import { GuildStorageDatabaseService } from "src/services/database/guild-storage";
import { ICourseImplementDiscord } from "src/models/discord/implement/course";
import { MajorImplementDiscordService } from "../major";
import { UserDatabaseService } from "src/services/database/user";

export class CourseImplementDiscordService {
  public static async getOrCreateCourseImplement(guildContext: GuildContext, course: Course): Promise<ICourseImplementDiscord> {
    const implement = await this.getCourseImplementIfExists(guildContext, course);
    if(implement) {
      return implement;
    }
    return await this.createCourseImplement(guildContext, course);
  }

  public static async getCourseImplementIfExists(guildContext: GuildContext, course: Course): Promise<ICourseImplementDiscord | undefined> {
    const implement = await GuildStorageDatabaseService.getCourseImplement(guildContext, course);
    if(implement) {
      return implement;
    }
    return undefined;
  }

  private static async createCourseImplement(guildContext: GuildContext, course: Course): Promise<ICourseImplementDiscord> {
    const majorImplement = await MajorImplementDiscordService.getOrCreateMajorImplement(guildContext, course.major);
    
    const mainRoleId = (await CourseRoleImplementDiscordService.createMainRole(guildContext, course)).id;
    const taRoleId = (await CourseRoleImplementDiscordService.createTARole(guildContext, course)).id;
    const mainChannelId = (await CourseChannelImplementDiscordService.createMainChannel(guildContext, course, majorImplement.textCategoryId, mainRoleId, taRoleId)).id;
    const voiceChannelId = (await CourseChannelImplementDiscordService.createVoiceChannel(guildContext, course, majorImplement.voiceCategoryId, mainRoleId, taRoleId)).id;

    const implement = {
      mainRoleId,
      taRoleId,
      mainChannelId,
      voiceChannelId
    };

    await GuildStorageDatabaseService.setCourseImplement(guildContext, course, implement);
    return implement;
  }

  public static async deleteCourseImplementIfEmpty(guildContext: GuildContext, course: Course): Promise<void> {
    const implement = await this.getCourseImplementIfExists(guildContext, course);
    if(!implement) {
      return;
    }

    if((await UserDatabaseService.getUsersByCourse(guildContext, course)).length > 0) {
      return;
    }

    await guildContext.guild.channels.resolve(implement.mainChannelId).delete();
    await guildContext.guild.channels.resolve(implement.voiceChannelId).delete();
    await guildContext.guild.roles.resolve(implement.mainRoleId).delete();
    await guildContext.guild.roles.resolve(implement.taRoleId).delete();

    await GuildStorageDatabaseService.setCourseImplement(guildContext, course, undefined);
    await MajorImplementDiscordService.deleteMajorImplementIfEmpty(guildContext, course.major);
  }

  // TODO: Repair implement
}