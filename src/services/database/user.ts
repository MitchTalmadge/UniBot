import * as Discord from "discord.js";
import { GuildContext } from "guild-context";
import _ from "lodash";
import { Course, PartialCourse } from "models/course";
import { IUser, IUserCourseAssignment, User } from "models/database/user";
import { VerificationStatus } from "models/verification-status";
import moment from "moment";
import { CourseUtils } from "utils/course";
import { VerificationUtils } from "utils/verification";

export class UserDatabaseService {
  /**
   * Finds a database User by a Discord User ID. Optionally initializes missing guild data.
   * @param discordUserId The ID of the associated Discord User.
   * @param guildContext The guild context. If provided, the User's guild data will be initialized if it is empty.
   */
  public static async findOrCreateUser(discordUserId: string, guildContext?: GuildContext): Promise<IUser> {
    let user = await User.findOne({ discordUserId: discordUserId }).exec();
    if (!user) {
      user = await new User(
        <IUser>{
          discordUserId: discordUserId
        }).save();
    }

    if(guildContext) {
      if(!user.guilds.has(guildContext.guild.id)) {
        user.guilds.set(guildContext.guild.id, {
          courses: [],
          coursesLastUpdated: moment()
        });

        user = await user.save();
      }
    }

    return user;
  }

  public static async addCoursesToMember(guildContext: GuildContext, discordMember: Discord.GuildMember, courses: Course[]): Promise<void> {
    const user = await this.findOrCreateUser(discordMember.user.id, guildContext);

    const serializedCourses: IUserCourseAssignment[] =
      courses.map(course =>
        <IUserCourseAssignment>{
          courseKey: course.key,
          isTA: false
        });

    const guildData = user.guilds.get(guildContext.guild.id);
    guildData.courses = _.unionBy(guildData.courses, serializedCourses, course => course.courseKey);
    guildData.coursesLastUpdated = moment();
    await user.save();
  }

  public static async removeCoursesFromMember(guildContext: GuildContext, discordMember: Discord.GuildMember, courses: Course[]): Promise<void> {
    const user = await this.findOrCreateUser(discordMember.user.id, guildContext);
    const courseKeys = courses.map(course => course.key);

    const guildData = user.guilds.get(guildContext.guild.id);
    guildData.courses = guildData.courses.filter(course => !courseKeys.includes(course.courseKey));
    guildData.coursesLastUpdated = moment();
    await user.save();
  }

  public static async removeAllCoursesFromMember(guildContext: GuildContext, discordMember: Discord.GuildMember): Promise<void> {
    const user = await this.findOrCreateUser(discordMember.user.id, guildContext);

    const guildData = user.guilds.get(guildContext.guild.id);
    guildData.courses = [];
    guildData.coursesLastUpdated = moment();
    await user.save();
  }

  public static async toggleTAStatusForMember(guildContext: GuildContext, discordMember: Discord.GuildMember, courses: Course[]): Promise<void> {
    const user = await this.findOrCreateUser(discordMember.user.id, guildContext);
    const courseKeys = courses.map(course => course.key);

    const guildData = user.guilds.get(guildContext.guild.id);
    guildData.courses
      .filter(course => courseKeys.includes(course.courseKey))
      .forEach(course => {
        course.isTA = !course.isTA;
      });
    guildData.coursesLastUpdated = moment();
    await user.save();
  }
  
  public static async getUsersByCourse(guildContext: GuildContext, course: PartialCourse): Promise<IUser[]> {
    const key = `guilds.${guildContext.guild.id}.courses.courseKey`;
    const users = await User.find({ [key]: course.key }).exec();

    return users;
  }

  public static async generateAndStoreVerificationCode(discordUser: Discord.User, studentId: string): Promise<string> {
    const user = await this.findOrCreateUser(discordUser.id);
    const verificationCode = VerificationUtils.generateVerificationCode();

    user.studentId = studentId;
    user.verificationCode = verificationCode;
    user.verificationStatus = VerificationStatus.CODE_SENT;
    await user.save();

    return verificationCode;
  }

  public static async getUserByCode(verificationCode: string): Promise<IUser> {
    const user = await User.findOne({ "verificationCode": verificationCode }).exec();
    return user;
  }

  public static async setUserVerified(guildContext: GuildContext, discordMember: Discord.GuildMember): Promise<void> {
    const user = await this.findOrCreateUser(discordMember.id);

    user.verificationStatus = VerificationStatus.VERIFIED;
    user.verificationCode = undefined;
    await user.save();
  }
}