import { createEvent } from 'seyfert';
 
export default createEvent({
  data: { once: true, name: 'botReady' },
  run(user, client) {
    client.aqua.init(client.botId);
    console.log('sucess')
 
    client.logger.info(`${user.username} is ready`);
 
  }
})