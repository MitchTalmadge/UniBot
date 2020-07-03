import * as Discord from "discord.js";
import { VerificationStatus } from "models/verification-status";
import { ConfigService } from "services/config";
import { UserDatabaseService } from "services/database/user";
import { DiscordUtils } from "utils/discord";

import { CommandController } from "./command-controller";

export class ModeratorCommandController extends CommandController {
  public onMessageReceived(message: Discord.Message | Discord.PartialMessage): void {
    if(!message.content.startsWith("!mod ")) {
      return;
    }

    if (!this.isModerator(message.member)) {
      this.guildContext.guildLog(`User ${DiscordUtils.describeUserForLogs(message.author)} tried to use a moderator command but was not a moderator.`);
      return;
    }

    const tokens = message.content.toLowerCase().split(/\s+/);
    if(tokens.length == 1) {
      message.reply("please supply a command.");
      return;
    }

    switch(tokens[1]) {
      case "whois":
        this.runWhoisCommand(message, tokens);
        break;
      default:
        this.guildContext.guildLog(`User ${DiscordUtils.describeUserForLogs(message.author)} tried to use a non-existent moderator command: ${tokens[0]}.`);
    }
  }

  private async runWhoisCommand(message: Discord.Message | Discord.PartialMessage, tokens: string[]) {
    if(tokens.length != 3 || message.mentions.users.size != 1) {
      message.reply("please mention one user.");
      return;
    }

    const discordUser = message.mentions.users.first();
    const user = await UserDatabaseService.findOrCreateUser(discordUser.id, this.guildContext);

    const guildStrings: string[] = [];
    for(let guildEntry of user.guilds.entries()) {
      const guildId = guildEntry[0];
      const guild = this.guildContext.guild.client.guilds.resolve(guildId);
      const guildMeta = guildEntry[1];
      
      let guildString = `  - "${guild.name}" (ID ${guild.id})`;

      // Courses
      guildString += "\n    - Courses:";
      for(let course of guildMeta.courses) {
        guildString += `\n      - ${course.courseKey} (TA: ${course.isTA})`;
      }

      guildStrings.push(guildString);
    }

    message.reply(`details of ${discordUser.username}#${discordUser.discriminator} (ID ${discordUser.id}):\n`
    + `- Verification Status: ${VerificationStatus[user.verificationStatus]}\n`
    + `  - Student ID: ${user.studentId}\n`
    + "- Network Status:\n"
    + guildStrings.join("\n"));
  }

  private isModerator(member: Discord.GuildMember): boolean {
    const moderatorRoleName = ConfigService.getConfig().guilds[this.guildContext.guild.id].moderatorRoleName.toLowerCase();
    return member.roles.cache.some(r => r.name.toLowerCase() === moderatorRoleName);
  }
}