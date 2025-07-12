import {Command, Declare, type CommandContext, Embed} from 'seyfert'

@Declare({
    name: 'pause',
    description: 'pause the music',
})
export default class pauseCmds extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
      try {
          const { client } = ctx;

        const player = client.aqua.players.get(ctx.guildId!);
        if (!player) return;

        let memberVoice = await ctx.member?.voice().catch(() => null);
        let botvoice = await (await ctx.me()).voice().catch(() => null);
        if (!memberVoice || botvoice && botvoice.channelId !== memberVoice.channelId) return;

        player.pause(true);

        await ctx.editOrReply({ embeds: [new Embed().setDescription('Paused the song').setColor(0)] });
        } catch (error) {
           if(error.code === 10065) return;
        }
    }
}