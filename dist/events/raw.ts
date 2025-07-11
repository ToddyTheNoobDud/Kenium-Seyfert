import { createEvent } from "seyfert";


export default createEvent({
    data: { name: "raw" },
    async run(data, client) {
        // @ts-ignore
    if ((data.t === 'VOICE_SERVER_UPDATE') || (data.t === 'VOICE_STATE_UPDATE')) {
                // @ts-ignore
     await client.aqua.updateVoiceState({ t: data.t, d: data.d });
    }
    },
});