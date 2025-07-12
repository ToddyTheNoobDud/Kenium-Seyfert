import { Command, Declare, type CommandContext, Embed} from 'seyfert'

@Declare({
    name: 'destroy',
    description: 'destroy the music',
})

export default class destroycmd extends Command {
    public override async run(ctx: CommandContext): Promise<void> {
        try {
            const { client } = ctx;
    
            const player = client.aqua.players.get(ctx.guildId!);
            if (!player) return;
    
            let memberVoice = await ctx.member?.voice().catch(() => null);
            let botvoice = await (await ctx.me()).voice().catch(() => null);
            if (!memberVoice || botvoice && botvoice.channelId !== memberVoice.channelId) return;
    
            player.destroy();
    
            await ctx.editOrReply({ embeds: [new Embed().setDescription('Destroyed the music').setColor(0)], flags: 64 });
        } catch (error) {
            if(error.code === 10065) return;
        }
    }
}