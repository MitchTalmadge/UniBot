import * as Discord from "discord.js";
import _ from "lodash";
import { Course } from "models/course";
import { CourseImplementChannelType } from "models/implement/course";
import { Major } from "models/major";
import { CourseService } from "services/course";
import { CourseImplementService } from "services/implement/course/implement";
import { MemberUpdateService } from "services/member-update";
import { CourseUtils } from "utils/course";
import { DiscordMessageUtils } from "utils/discord-message";

import { ChannelController } from "./channel-controller";

export class CourseSelectionChannelController extends ChannelController {
  // TODO: async-ify
  public async onMessageReceived(message: Discord.Message): Promise<void> {
    if (message.content.toLowerCase().startsWith("join")) {
      this.joinOrLeaveCourses(message, "join")  
        .then(result => {
          const validCourseNames = result.validCourses.map(c => c.key);
          if(result.invalidCourseNames.length > 0) {
            DiscordMessageUtils.sendMessage(message.channel, `${message.author}, I have added you to the following courses: ${validCourseNames.join(", ")}. However, the following courses do not appear to be valid: ${result.invalidCourseNames.join(", ")}.`);
          } else {
            DiscordMessageUtils.sendMessage(message.channel, `Success! ${message.author}, I have added you to the following courses: ${validCourseNames.join(", ")}.`); 
          }

          for(let course of result.validCourses) {
            CourseImplementService.getCourseImplementIfExists(this.guildContext, course)
              .then(implement => {
                if (implement) {
                  const courseChannel = this.guildContext.guild.channels.resolve(implement.channelIds[CourseImplementChannelType.CHAT]) as Discord.TextChannel;
                  courseChannel?.send(`Welcome, ${message.author}!`);
                }
              })
              .catch(err => {
                console.error("Could not get course implement when announcing user course join:", err);
              });
          }
        })
        .catch(errorMessage => {
          DiscordMessageUtils.sendMessage(message.channel, `${errorMessage} Example usage: join 1410`);
          // TODO: Better example.
        });
    } else if (message.content.toLowerCase().startsWith("leave")) {
      this.joinOrLeaveCourses(message, "leave")  
        .then(result => {
          const validCourseNames = result.validCourses.map(c => c.key);
          if(result.invalidCourseNames.length > 0) {
            DiscordMessageUtils.sendMessage(message.channel, `${message.author}, I have removed you from the following courses: ${validCourseNames.join(", ")}. However, the following courses do not appear to be valid: ${result.invalidCourseNames.join(", ")}.`);
          } else {
            DiscordMessageUtils.sendMessage(message.channel, `Success! ${message.author}, I have removed you from the following courses: ${validCourseNames.join(", ")}.`); 
          }
        })
        .catch(errorMessage => {
          DiscordMessageUtils.sendMessage(message.channel, `${errorMessage} Example usage: leave 1410`);
          // TODO: Better example.
        });
    } else if (message.content.toLowerCase().startsWith("ta")) {
      // Join the courses just in case (also takes care of validation).
      this.joinOrLeaveCourses(message, "join")  
        .then(result => {
          const validCourseNames = result.validCourses.map(c => c.key);
          return MemberUpdateService.queueToggleTAStatus(this.guildContext, message.member, result.validCourses)
            .then(() => {
              if(result.invalidCourseNames.length > 0) {
                DiscordMessageUtils.sendMessage(message.channel, `${message.author}, I have toggled your TA status for the following courses: ${validCourseNames.join(", ")}. However, the following courses do not appear to be valid: ${result.invalidCourseNames.join(", ")}.`);
              } else {
                DiscordMessageUtils.sendMessage(message.channel, `Success! ${message.author}, I have toggled your TA status for the following courses: ${validCourseNames.join(", ")}.`); 
              }
            });
        })
        .catch(errorMessage => {
          DiscordMessageUtils.sendMessage(message.channel, `${errorMessage} Example usage: ta 1410`);
          // TODO: Better example.
        });
    } else {
      //TODO: Better example
      DiscordMessageUtils.sendMessage(message.channel, `${message.author}, I'm not sure what you want to do. Make sure your request starts with 'join', 'leave', or 'ta'. For example: 'join 1410'`);
    }
  }

  // TODO: async-ify
  private joinOrLeaveCourses(message: Discord.Message, action: "join" | "leave"): Promise<{validCourses: Course[], invalidCourseNames: string[]}> {
    const separatorIndex = message.content.indexOf(" ");
    if(separatorIndex === -1) {
      return Promise.reject(`${message.author}, I didn't see any course numbers in your request!`);
    }
    
    const numbers = CourseUtils.parseCourseNumberList(message.content.substring(separatorIndex + 1));
    // Check for empty request
    if (Object.keys(numbers).length === 0) {
      return Promise.reject(`${message.author}, I didn't see any course numbers in your request!`);
    }

    // Fix ambiguity
    if (!this.disambiguateNumbers(numbers)) {
      return Promise.reject(`${message.author}, please specify major prefixes for each of your courses.`);
    }

    // Check for non-existent majors
    const invalidMajors = this.getInvalidMajors(Object.keys(numbers));
    if (invalidMajors.length > 0) {
      return Promise.reject(`Sorry ${message.author}, the major(s) '${invalidMajors.join(", ")}' are not valid in this server. The valid majors are: ${Object.keys(this.guildContext.majors).join(", ")}.`);
    }

    // Convert numbers to courses
    return CourseService.getCoursesFromNumberListsByMajor(this.guildContext, numbers)
      .catch(err => {
        this.guildContext.guildError(`Failed to parse courses from ${action} request:`, err);
        return Promise.reject(`${message.author}, sorry, something went wrong while I was trying to read your message. Try again or ask an admin for help!`);
      })
      .then(result => {
        // Remove invalid courses and keep track of them to show the user.
        const allValidCourses: Course[] = [];
        const allInvalidCourseNames: string[] = [];
        _.keys(result).forEach(major => {
          const courses = result[major];
          allValidCourses.push(...courses.validCourses);
          allInvalidCourseNames.push(...courses.invalidCourseNames);
        });

        if (allValidCourses.length === 0) {
          return Promise.reject(`Sorry ${message.author}, none of the courses you specified appear to be valid: ${allInvalidCourseNames.join(", ")}. If you think this is a mistake, ask an admin for help!`);
        }

        DiscordMessageUtils.sendMessage(message.channel, `${message.author}, your request has been queued!`);

        // Add all courses to member.
        return Promise.resolve()
          .then(() => {
            if(action == "join")
              return MemberUpdateService.queueAssignCourses(this.guildContext, message.member, allValidCourses);
            else
              return MemberUpdateService.queueUnassignCourses(this.guildContext, message.member, allValidCourses);
          })
          .catch(err => {
            this.guildContext.guildError(`Failed to set courses for member during ${action} request:`, err);
            return Promise.reject(`Sorry ${message.author}, something internal went wrong when I tried to assign your courses. Try again or ask an admin for help!`);
          })
          .then(() => {
            return { validCourses: allValidCourses, invalidCourseNames: allInvalidCourseNames };
          });          
      });
  }

  /**
   * Determines which of the major prefixes passed in are invalid.
   * @param prefixes The prefixes, lowercased.
   * @returns An array containing the invalid prefixes.
   */
  private getInvalidMajors(prefixes: string[]): string[] {
    const invalidMajors = _.filter(prefixes, prefix => {
      return prefix && !this.guildContext.majors[prefix];
    });
    return invalidMajors;
  }

  /**
   * Attempts to remove ambiguity from the parsed numbers (having an empty major when more than one major could be a candidate).
   *
   * @param numbers The numbers to disambiguate.
   * @return True if disambiguated. False if cannot be done.
   */
  private disambiguateNumbers(numbers: { [majorPrefix: string]: string[] }): boolean {
    if (numbers[""]) {
      if (Object.keys(this.guildContext.majors).length > 1) {
        return false;
      } else {
        const major: Major = Object.values(this.guildContext.majors)[0];
        if (!numbers[major.prefix]) {
          numbers[major.prefix] = numbers[""];
        } else {
          numbers[major.prefix] = _.union(numbers[major.prefix], numbers[""]);
        }
        delete numbers[""];
      }
    }

    return true;
  }
}