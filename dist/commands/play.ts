import {
    Command,
    createStringOption,
    Declare,
    type GuildCommandContext,
    Options,
    Embed,
} from "seyfert";

const EMBED_COLOR = "#000000"; 

const ERROR_MESSAGES = {
    UNSUPPORTED: "The provided query type is not supported.",
    TIMEOUT: "The query timed out. Please try again.",
    GENERIC: "An unexpected error occurred while trying to play the song. Please try again later.",
};

const options = {
    query: createStringOption({
        description: "The song you want to search for",
        required: true,
    }),
};

@Declare({
    name: "play",
    description: "Play a song by search query or URL.",
})
@Options(options)
export default class Play extends Command {
    private createPlayEmbed(result: any, player: any, query: string): Embed {
        const embed = new Embed().setColor(EMBED_COLOR).setTimestamp();

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

            await ctx.deferReply();
            
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
