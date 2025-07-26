// @ts-nocheck
// index.js - Revenge First Message Plugin

// Import necessary modules from Vendetta/Revenge environment
import { registerCommand } from "@vendetta/commands";
import { findByProps } from "@vendetta/metro";
import { url } from "@vendetta/metro/common"; // Assuming 'url' is available here
import { logger } from "@vendetta"; // For logging

// Define ApplicationCommandType and ApplicationCommandOptionType based on Vendetta's structure
// These are typically enums, so we use their numeric values directly as seen in your Vendetta example.
const ApplicationCommandType = {
  CHAT: 1, // Corresponds to CHAT_INPUT
};

const ApplicationCommandInputType = {
  BUILT_IN_TEXT: 1, // Corresponds to BUILT_IN_TEXT
};

const ApplicationCommandOptionType = {
  USER: 6,
  CHANNEL: 7,
  BOOLEAN: 5,
};

// Find Discord's internal API utility functions
const APIUtils = findByProps("getAPIBaseURL", "get");
const { sendBotMessage } = findByProps("sendBotMessage"); // For sending bot messages in chat

// Explicitly type 'commands' as an array of functions that return void
let commands: (() => void)[] = []; // Array to store unregister functions for commands

/**
 * Fetches the first message in a guild channel.
 * @param {string} guildId - The ID of the guild.
 * @param {string} [userId] - Optional: The ID of a specific user to filter messages by.
 * @param {string} [channelId] - Optional: The ID of a specific channel to search in.
 * @returns {Promise<object>} The first message object.
 */
const getFirstGuildMessage = async (guildId, userId, channelId) => {
  const userParam = userId ? `&author_id=${userId}` : "";
  const channelParam = channelId ? `&channel_id=${channelId}` : "";
  // min_id=0 is used to search from the very beginning of the channel's history.
  // If a user filter is applied, min_id might not be necessary or could interfere,
  // so we apply it conditionally as in your original plugin.
  const minIdParam = userId ? "" : `&min_id=0`;

  try {
    const response = await APIUtils.get({
      url: `/guilds/${guildId}/messages/search`,
      query: `include_nsfw=true${userParam}${channelParam}${minIdParam}&sort_by=timestamp&sort_order=asc&offset=0`
    });
    // The API returns messages in a nested array: body.messages[0][0] for the first message.
    return response.body.messages[0]?.[0];
  } catch (error) {
    logger.error(`[First Message Plugin] Error fetching guild messages:`, error);
    return null;
  }
};

/**
 * Fetches the first message in a DM channel.
 * @param {string} dmId - The ID of the DM channel.
 * @param {string} [userId] - Optional: The ID of a specific user to filter messages by.
 * @returns {Promise<object>} The first message object.
 */
const getFirstDMMessage = async (dmId, userId) => {
  const userParam = userId ? `&author_id=${userId}` : "";
  // min_id=0 is used to search from the very beginning of the channel's history.
  const minIdParam = userId ? "" : `&min_id=0`;

  try {
    const response = await APIUtils.get({
      url: `/channels/${dmId}/messages/search`,
      query: `&sort_by=timestamp&sort_order=asc&offset=0${userParam}${minIdParam}`
    });
    // The API returns messages in a nested array: body.messages[0][0] for the first message.
    return response.body.messages[0]?.[0];
  } catch (error) {
    logger.error(`[First Message Plugin] Error fetching DM messages:`, error);
    return null;
  }
};

// Function to get the current channel ID.
// This relies on Discord's internal stores, which are usually accessible via findByProps.
// We'll use a common pattern to find the relevant store.
function getCurrentChannelId() {
  const ChannelStore = findByProps("getCurrentlySelectedChannelId");
  return ChannelStore?.getCurrentlySelectedChannelId();
}

// The main plugin object
export const onLoad = () => {
  logger.log("[First Message Plugin] Loading...");

  commands.push(registerCommand({
    name: "firstmessage",
    displayName: "firstmessage",
    description: "Tired of scrolling to first message?",
    displayDescription: "Tired of scrolling to first message?",
    type: ApplicationCommandType.CHAT,
    inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
    applicationId: "-1", // Standard for client mod commands
    options: [
      {
        name: "user",
        displayName: "user",
        description: "Target user to get their first message in this server/dm",
        displayDescription: "Target user to get their first message in this server/dm",
        type: ApplicationCommandOptionType.USER,
        required: false
      },
      {
        name: "channel",
        displayName: "channel",
        description: "Target channel to get first message of",
        displayDescription: "Target channel to get first message of",
        type: ApplicationCommandOptionType.CHANNEL,
        required: false
      },
      {
        name: "send",
        displayName: "send",
        description: "Whether to send the resulting url",
        displayDescription: "Whether to send the resulting url",
        type: ApplicationCommandOptionType.BOOLEAN,
        required: false
      }
    ],
    execute: async (args, ctx) => {
      const userArg = args.find((o) => o.name === "user");
      const channelArg = args.find((o) => o.name === "channel");
      const sendArg = args.find((o) => o.name === "send");

      const user = userArg?.value;
      const channel = channelArg?.value;
      const send = sendArg?.value;

      const guildId = ctx.guild?.id;
      const currentChannelId = ctx.channel.id;
      const isDM = ctx.channel.type === 1;

      let resultUrl = "https://discord.com/channels/";
      let messageToJumpTo = null;

      try {
        if (!user && !channel) {
          // No user or channel specified: get first message in current channel
          if (isDM) {
            messageToJumpTo = await getFirstDMMessage(currentChannelId);
            resultUrl += `@me/${currentChannelId}/${messageToJumpTo?.id}`;
          } else {
            // Pass undefined for userId to signify no user filter
            messageToJumpTo = await getFirstGuildMessage(guildId, undefined, currentChannelId);
            resultUrl += `${guildId}/${currentChannelId}/${messageToJumpTo?.id}`;
          }
        } else if (user) {
          // User specified: get first message by user in current context
          if (isDM) {
            messageToJumpTo = await getFirstDMMessage(currentChannelId, user);
            resultUrl += `@me/${currentChannelId}/${messageToJumpTo?.id}`;
          } else {
            messageToJumpTo = await getFirstGuildMessage(guildId, user, currentChannelId);
            resultUrl += `${guildId}/${currentChannelId}/${messageToJumpTo?.id}`;
          }
        } else if (channel) {
          // Channel specified: get first message in target channel (only in guilds)
          if (isDM) {
            sendBotMessage(currentChannelId, "This combination cannot be used in dms!");
            return { send: false };
          }
          // Pass undefined for userId to signify no user filter
          messageToJumpTo = await getFirstGuildMessage(guildId, undefined, channel);
          resultUrl += `${guildId}/${channel}/${messageToJumpTo?.id}`;
        } else { // both user and channel are present
          // This case handles both user and channel arguments provided in a guild.
          if (isDM) {
            sendBotMessage(currentChannelId, "This combination cannot be used in dms!");
            return { send: false };
          }
          messageToJumpTo = await getFirstGuildMessage(guildId, user, channel);
          resultUrl += `${guildId}/${channel}/${messageToJumpTo?.id}`;
        }

        // Check if a message was successfully found before attempting to use its ID
        if (!messageToJumpTo?.id) {
            sendBotMessage(currentChannelId, "Could not find the first message with the given criteria.");
            return { send: false };
        }

        if (send) {
          return { content: resultUrl };
        } else {
          url.openDeeplink(resultUrl);
          return { send: false, result: "Attempted to jump to the first message." };
        }
      } catch (e) {
        logger.error(`[First Message Plugin] Error in execute:`, e);
        sendBotMessage(currentChannelId, "An error occurred while trying to find the first message.");
        return { send: false };
      }
    }
  }));

  logger.log("[First Message Plugin] Loaded successfully.");
};

// The 'onUnload' function is called when the plugin is disabled or unloaded.
export const onUnload = () => {
  logger.log("[First Message Plugin] Unloading...");
  for (const unregister of commands) {
    unregister(); // Call each unregister function
  }
  commands = []; // Clear the array
  logger.log("[First Message Plugin] Unloaded successfully.");
};
