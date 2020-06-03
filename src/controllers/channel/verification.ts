import * as Discord from "discord.js";
import { ChannelController } from "./channel-controller";
import { ConfigService } from "services/config";
import { GuildContext } from "guild-context";
import { UserDatabaseService } from "services/database/user";
import { VerificationStatus } from "models/verification-status";
import { VerifierService } from "services/verification/verifier";
import { VerifierServiceFactory } from "services/verification/verifier-factory";
import { DiscordUtils } from "utils/discord";
import { IUser } from "models/database/user";

export class VerificationChannelController extends ChannelController {
  public static readonly CHANNEL_NAME = "get-verified";

  private enabled: boolean;

  private verifier: VerifierService;

  constructor(guildContext: GuildContext) { 
    super(guildContext);

    this.enabled = ConfigService.getConfig().verification.enabled;
    if(this.enabled) {
      this.verifier = VerifierServiceFactory.getVerifier(ConfigService.getConfig().verification.verifier);
    }
  }

  public async onMessageReceived(message: Discord.Message | Discord.PartialMessage): Promise<void> {
    if(!this.enabled) {
      return;
    }

    // Remove the user's message immediately for privacy since they often contain student IDs.
    await this.purgeMessage(message);

    const contents = message.content.trim();

    let user: IUser;
    try {
      user = await UserDatabaseService.findOrCreateUser(message.author.id);
    } catch(err) {
      this.guildContext.guildError(`Could not retrieve user object from DB while checking verification status for ${DiscordUtils.describeUserForLogs(message.author)}`, err);
      this.sendMessage(message.channel, `Sorry, ${message.author}, there was an error while checking your verification status. Please try again or ask an admin for help!`);
      return;
    }

    if(user) {
      switch(user.verificationStatus) {
        case VerificationStatus.VERIFIED:
          await this.sendMessage(message.channel, `${message.author}, you are already verified!`);
          return;
        case VerificationStatus.CODE_SENT:
          // Check if the user has input a code.
          if(contents.trim() === user.verificationCode) {
            // Code matches.
            await this.sendMessage(message.channel, `Success! ${message.author}, you will be able to speak momentarily. Thanks for helping to keep the server safe!`);
            UserDatabaseService.setUserVerified(this.guildContext, message.member)
              .catch(err => {
                console.error(`Could not set user with ID ${message.author.id} as verified`, err);
                this.sendMessage(message.channel, `Oops! Sorry ${message.author}, there was an error while giving you the verified role. Please ask an admin for help!`);
              });
          } else {
            await this.sendMessage(message.channel, `Sorry ${message.author}, that code does not look correct. Try again, or ask an admin if you need a new email sent out.`);
            // TODO: Allow user to try new student ID? (Typo)
          }
          return;
        default:
          break;
      }
    }

    // Check if the input is a student ID.
    if(!this.verifier.looksLikeStudentID(contents)) {
      await this.sendMessage(message.channel, `Sorry ${message.author}, I don't know what you're trying to do! If you want to become verified, just say your student ID here.`)
      return;
    }

    // The user has put in their student ID.
    await this.sendMessage(message.channel, `Ok, ${message.author}, just one more step. I am sending a secret code to your student email address. Just find and type the code here to become verified! Remember to check your spam.`);
    
    // Obtain a verification code.
    let verificationCode: string;
    try {
      verificationCode = await UserDatabaseService.generateAndStoreVerificationCode(message.author, contents);
    } catch (err) {
      this.guildContext.guildError("Failed to generate verification code:", err);
      this.sendMessage(message.channel, `Oops! Sorry ${message.author}, something went wrong while I was generating your code. Please try again or ask an admin for help!`);
      return;
    }

    // Send the verification code.
    try {
      await this.verifier.sendVerificationEmail(contents, message.author, verificationCode);
    } catch (err) {
      this.guildContext.guildError("Failed to send verification email:", err);
      this.sendMessage(message.channel, `Oops! Sorry ${message.author}, something went wrong and I couldn't send out the verification email. Please try again or ask an admin for help!`);
      return;
    }
  }
}