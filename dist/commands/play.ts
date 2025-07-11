import {
    Command,
    createStringOption,
    Declare,
    type GuildCommandContext,
    Options,
    Embed,
} from "seyfert";


const MAX_AUTOCOMPLETE_RESULTS = 4;
const MAX_RECENT_ITEMS = 4;
const EMBED_COLOR = 0x000000;
const AUTOCOMPLETE_THROTTLE_MS = 500;


async function truncateTrackName(title, author) {
    const titlePart = title?.slice(0, 97) || "";
    const authorPart = author ? ` - ${author.slice(0, 20)}` : "";

    const combined = `${titlePart}${authorPart}`;
    return combined.length > 100 ? combined.slice(0, 97) + "..." : combined;
}


async function getFormattedRecentSelections(recentSelections) {
    return (recentSelections || [])
        .slice(0, MAX_RECENT_ITEMS)
        .map(item => ({
            name: ` - Recently played: ${item.title?.slice(0, 97) || "Unknown"}`.slice(0, 97),
            value: (item.uri || "").slice(0, 97)
        }));
}

async function combineResultsWithRecent(suggestions, recentSelections, query) {
    const queryLower = query.toLowerCase();
    const recentUris = new Set(suggestions.map(s => s.value));

    const filteredRecent = recentSelections
        .filter(item => !recentUris.has(item.uri) && (!query || item.title.toLowerCase().includes(queryLower)))
        .map(item => ({ name: ` ${item.title.slice(0, 97)}`, value: item.uri.slice(0, 97) }));

    return [...filteredRecent.slice(0, MAX_RECENT_ITEMS), ...suggestions].slice(0, MAX_AUTOCOMPLETE_RESULTS + MAX_RECENT_ITEMS);
}

const ERROR_MESSAGES = {
    NO_VOICE: "You must be in a voice channel to use this command.",
    NO_TRACKS: "No tracks found for the given query.",
    TIMEOUT: "The request timed out. Please try again.",
    GENERIC: "An error occurred while processing your request. Please try again later.",
    UNSUPPORTED: "Unsupported content type.",
    getDifferentChannel: (id) => `I'm already in <#${id}>`
};

const userRecentSelections = new Map();
const lastCleanupTime = { value: Date.now() };
const URL_REGEX = /^https?:\/\/.+/i;
let lastAutocomplete: 0;
const options = {
    query: createStringOption({
        description: "The song you want to search for",
        required: true,
        autocomplete: async (interaction: any) => {
            const { client } = interaction;
            const voiceChannel = interaction.member.voice()

            if (!voiceChannel) {
                return interaction.respond([]);
            }

            const focused = interaction.getInput() || "";
            const userId = interaction.user.id;
            const recentSelectionObject = userRecentSelections.get(userId) || { items: [], lastAccessed: null };
            const recentSelections = recentSelectionObject.items || [];

            if (URL_REGEX.test(focused)) {
                return interaction.respond([]);
            }

            const now = Date.now();
            if (now - lastAutocomplete < AUTOCOMPLETE_THROTTLE_MS) {
                return interaction.respond([]);
            }
            // @ts-ignore
            lastAutocomplete = now;

          try {
            if (!focused) {
              const formattedRecent = await getFormattedRecentSelections(recentSelections); 
              return interaction.respond(formattedRecent);
            }

            const result = await client.aqua.search(focused, userId);

            if (!result?.length) {
              const formattedRecent = await getFormattedRecentSelections(recentSelections); 
              return interaction.respond(formattedRecent);
            }

            const suggestionsPromises = result
              .slice(0, MAX_AUTOCOMPLETE_RESULTS)
              .map(async track => ({
                name: await truncateTrackName(track?.info?.title, track?.info?.author),
                value: track?.info?.uri.slice(0, 97)
              }));

            const suggestions = await Promise.all(suggestionsPromises); 

            const combined = await combineResultsWithRecent(suggestions, recentSelections, focused); 

            return interaction.respond(combined);
          } catch (error) {
            console.error("Autocomplete error:", error);
            const formattedRecent = await getFormattedRecentSelections(recentSelections); 
            return interaction.respond(formattedRecent);
          }
        },
    }),
};

@Declare({
    name: "play",
    description: "Play a song by search query or URL.",
})
@Options(options)
export default class Play extends Command {
    private createPlayEmbed(result: any, player: any, query: string): Embed {
        
        const embed = new Embed().setColor(EMBED_COLOR).setTimestamp()

        switch (result.loadType) {
            case "track":
            case "search": {
                const track = result.tracks[0];
                player.queue.add(track);
                embed.setDescription(`Added [**${track.info.title}**](${track.info.uri}) to the queue.`);
                break;
            }
            case "playlist": {
                for (const track of result.tracks) {
                    player.queue.add(track);
                }
                embed.setDescription(
                    `Added [**${result.playlistInfo.name}**](${query}) playlist (${result.tracks.length} tracks) to the queue.`
                );
                if (result.playlistInfo.thumbnail) {
                    embed.setThumbnail(result.playlistInfo.thumbnail);
                }
                break;
            }
            default:
                throw new Error(ERROR_MESSAGES.UNSUPPORTED);
        }
        return embed;
    }

    private async sendErrorReply(ctx: GuildCommandContext, content: string): Promise<void> {
        await ctx.editResponse({ content });
    }

    private async handleError(ctx: GuildCommandContext, error: Error): Promise<void> {
        console.error("Play command error:", error);
        const message = error.message === "Query timeout"
            ? ERROR_MESSAGES.TIMEOUT
            : ERROR_MESSAGES.GENERIC;

        await ctx.editResponse({ content: message });
    }
    public override async run(ctx: GuildCommandContext): Promise<void> {
        const { options, client, channelId, member } = ctx;
        const { query } = options as { query: string };

        try {
            const me = await ctx.me();
            if (!me) {
                return await this.sendErrorReply(ctx, "I couldn't find myself in the guild.");
            }

            const state = await member.voice().catch(() => null);
            if (!state || !state.channelId) {
                return await this.sendErrorReply(ctx, "You must be in a voice channel to play music.");
            }

            await ctx.deferReply(true);

            const player = client.aqua.createConnection({
                guildId: ctx.guildId,
                voiceChannel: state.channelId,
                textChannel: channelId,
                deaf: true,
                defaultVolume: 65,
            });

            const result = await client.aqua.resolve({
                query: query,
                requester: ctx.interaction.user,
            });

            const embed = this.createPlayEmbed(result, player, query);

            await ctx.editResponse({ embeds: [embed] });

            if (!player.playing && !player.paused && player.queue.size > 0) {
                player.play();
            }
        } catch (error: any) {
            await this.handleError(ctx, error);
        }
    }
}
