import {
    Command,
    createStringOption,
    Declare,
    type GuildCommandContext,
    Options,
} from "seyfert";

const options = {
    query: createStringOption({
        description: "The song you want to search for",
        required: true,
    }),
}

@Declare({
    name: "play",
    description: "Play a song by search query or URL.",
})
@Options(options)
export default class Play extends Command {
    public override async run(ctx: GuildCommandContext): Promise<void> {
        const { options, client, channelId, member } = ctx;
        const { query } = options as { query: string };

        const me = await ctx.me();
        if (!me) return;

        const state = await member.voice().catch(() => null);
        if (!state) return;

        const voice = await state.channel();
        if (!voice) return;

        await ctx.deferReply();
        // @ts-ignore
        const player = client.aqua.createConnection({
            // @ts-ignore
            guildId: ctx.guildId,
            voiceChannel: voice.id,
            textChannel: channelId,
            deaf: true,
            defaultVolume: 65,
        });
        // @ts-ignore
        const result = await client.aqua.resolve({
            query: query,
            requester: ctx.interaction.user
        })

        console.log(result);

        player.queue.add(result.tracks[0])

        if (!player.playing && !player.paused && player.queue.size > 0) {
            player.play();
        }
    }
}