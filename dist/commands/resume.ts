import {Command, Declare, type CommandContext, Embed} from 'seyfert'

@Declare({
    name: 'resume',
    description: 'resume the music',
})
export default class resumecmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        const { client } = ctx;

        const player = client.aqua.players.get(ctx.guildId!);
        if (!player || !ctx.member?.voice()) return;


        if ((await (await ctx.me())?.voice()).channelId !== (await ctx.member.voice()).channelId) return;

        player.pause(false);

        await ctx.editOrReply({ embeds: [new Embed().setDescription('Paused the song').setColor(0)] });
    }
}