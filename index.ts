import { Client, HttpClient, ParseClient, Container } from "seyfert";
import { request } from 'node:https';
import { createRequire } from "module";
import 'dotenv/config';
const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME, token } = process.env;

// @ts-ignore
const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');



const client = new Client({
    presence: (shardId) => ({
        // @ts-ignore
        status: "idle",
        activities: [{
            name: "🌊 Kenium Code",
            type: 1, 
            url: "https://www.youtube.com/watch?v=5etqxAG9tVg",
        }],
        since: Date.now(),
        afk: true,
    })
});

const aqua = new Aqua(client, [{
    host: NODE_HOST,
    password: NODE_PASSWORD,
    port: NODE_PORT,
    secure: false,
    name: NODE_NAME
}], {
    defaultSearchPlatform: "ytsearch",
    restVersion: "v4",
    shouldDeleteMessage: true,
    infiniteReconnects: true,
    autoResume: true,
    leaveOnEnd: false,
});

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>>, ParseClient<HttpClient> {
        aqua: InstanceType<typeof Aqua>;
    }
    interface UsingClient extends ParseClient<Client<true>> { }
    interface UsingClient extends ParseClient<HttpClient> { }
    interface UsingClient extends ParseClient<HttpClient> { }
}

Object.assign(client, {
    aqua,
});
const UPDATE_INTERVAL = 10000;
const channelCache = new Map();
const lastUpdates = new Map();
const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████', '███████████', '████████████'];

const formatTime = ms => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${h.toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
};

const getChannel = id => channelCache.get(id) || client.cache.channels.get(id);

const canUpdate = id => {
    const last = lastUpdates.get(id) || 0;
    const now = Date.now();
    if (now - last < UPDATE_INTERVAL) return false;
    lastUpdates.set(id, now);
    return true;
};

const updateVoiceStatus = (id, status) => {
    if (!canUpdate(id)) return;

    const req = request({
        host: 'discord.com',
        path: `/api/v10/channels/${id}/voice-status`,
        method: 'PUT',
        headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
        timeout: 2000,
    }, res => res.statusCode !== 204 && console.error(`Voice status failed: ${res.statusCode}`));

    req.on('error', () => { });
    req.on('timeout', () => req.destroy());
    req.write(JSON.stringify({ status }));
    req.end();
};

const truncateText = (text, length) => text.length > length ? `${text.slice(0, length - 3)}...` : text;

const createEmbed = (player, track) => {
    const { position, volume, loop } = player;
    const { title, uri, length } = track;
    const progress = Math.min(12, Math.max(0, Math.round((position / length) * 12)));
    const bar = `\`[${PROGRESS_CHARS[progress]}⦿${'▬'.repeat(12 - progress)}]\``;
    const volIcon = volume === 0 ? '🔇' : volume < 30 ? '🔈' : volume < 70 ? '🔉' : '🔊';
    const loopIcon = { track: '🔂', queue: '🔁', none: '▶️' }[loop] || '▶️';

    return new Container({
        components: [
            {
                type: 9,
                components: [
                    {
                        type: 10,
                        content: `### [${truncateText(title, 60)}](${uri})`
                    },
                    {
                        type: 10,
                        content: `\`${formatTime(position)}\` ${bar} \`${formatTime(length)}\`\n\n${volIcon} \`${volume}%\` ${loopIcon} \`${track.requester.username}\``
                    }
                ],
                accessory: {
                    type: 11,
                    media: {
                        url: track.thumbnail || client.me.avatarURL({ extension: 'png' })
                    }
                }
            },
            {
                "type": 14,
                "divider": true,
                "spacing": 2
            },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        label: "🔉",
                        style: 1,
                        custom_id: "volume_down"
                    },
                    {
                        type: 2,
                        label: "⏮️",
                        style: 1,
                        custom_id: "previous"
                    },
                    {
                        type: 2,
                        label: player.paused ? "▶️" : "⏸️",
                        style: player.paused ? 3 : 1,
                        custom_id: player.paused ? "resume" : "pause"
                    },
                    {
                        type: 2,
                        label: "⏭️",
                        style: 1,
                        custom_id: "skip"
                    },
                    {
                        type: 2,
                        label: "🔊",
                        style: 1,
                        custom_id: "volume_up"
                    },
                ],
            },
        ],
        accent_color: 0
    });
}


let updateTimeout;
const updateMessage = (player, track, force = false) => {
    if (!player.nowPlayingMessage) return;

    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(async () => {
        try {
            const embed = force ? createEmbed(player, track) : player.cachedEmbed;
            await player.nowPlayingMessage.editOrReply({ components: [embed], flags: ["4096", "32768"] });
        } catch {
            player.nowPlayingMessage = null;
        }
    }, 500);
};

aqua.on("trackStart", async (player, track) => {
    const channel = getChannel(player.textChannel);
    if (!channel) return;

    try {
        const embed = createEmbed(player, track);
        player.cachedEmbed = embed;
        player.nowPlayingMessage = await channel.client.messages.write(channel.id, { components: [embed], flags: 4096 | 32768 });
        updateVoiceStatus(player.voiceChannel, `⭐ ${track.info.title} - Kenium 3.70`);
    } catch (e) {
        console.error("Track start error:", e);
    }
});

aqua.on("trackError", async (player, track, payload) => {
    const channel = getChannel(player.textChannel);
    if (!channel) return;

    console.log(payload.exception.message);
    try {
        await channel.client.messages.write(channel.id, { content: `❌ Error playing **${track.info.title}**:\n\`${payload.exception.message}\`` });
    } catch { }
});

aqua.on("playerDestroy", player => {
    updateVoiceStatus(player._lastVoiceChannel || player.voiceChannel, null);
    player.nowPlayingMessage = null;
});

aqua.on("queueEnd", player => {
    updateVoiceStatus(player.voiceChannel, null);
    player.nowPlayingMessage = null;
});

aqua.on('nodeError', (node, error) => console.error(`Node error: ${error}`));
aqua.on('nodeConnect', node => console.log(`Node connected: ${node.name}`));

client.start().then(() =>
    client.uploadCommands({ cachePath: "./commands.json" })
);
