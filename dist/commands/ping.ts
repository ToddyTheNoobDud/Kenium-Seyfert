import { Declare, Command, type CommandContext } from 'seyfert';
 
@Declare({
  name: 'ping',
  description: 'Show latency with Discord'
})
export default class PingCommand extends Command {
  async run(ctx: CommandContext) {
    const ping = ctx.client.gateway.latency;
 
    await ctx.write({
      content: `The latency is \`${ping}\``
    });
  }
}