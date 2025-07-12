import { Client, HttpClient, ParseClient, Container, LimitedMemoryAdapter, ParseMiddlewares, createEvent } from "seyfert";
import { request } from 'node:https';
import { createRequire } from "module";
import { CooldownManager } from "@slipher/cooldown";
import { middlewares } from "./dist/utils/middlewares";

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
    }),
    cache: {
        adapter: new LimitedMemoryAdapter({
            message: {
                expire: 5 * 60 * 1000,
                limit: 10,
            },
        }),
        disabledCache: {
            bans: true,
            emojis: true,
            stickers: true,
            roles: true,
            presences: true,
            stageInstances: true,
        },
    },
});

client.setServices({
    middlewares: middlewares
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
    autoResume: false,
    leaveOnEnd: false,
});

Object.assign(client, {
    aqua,
});

const UPDATE_INTERVAL = 10000;
const MAX_CACHE_SIZE = 50; 
const VOICE_STATUS_TIMEOUT = 2000;
const MAX_TITLE_LENGTH = 60;

const channelCache = new Map();
const lastUpdates = new Map();
const activeRequests = new Map();

const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████', '███████████', '████████████'];

const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getChannel = (id) => {
    let channel = channelCache.get(id);
    if (!channel) {
        channel = client.cache.channels.get(id);
        if (channel && channelCache.size < MAX_CACHE_SIZE) {
            channelCache.set(id, channel);
        }
    }
    return channel;
};

const canUpdate = (id) => {
    const last = lastUpdates.get(id) || 0;
    const now = Date.now();
    if (now - last < UPDATE_INTERVAL) return false;
    lastUpdates.set(id, now);
    return true;
};

const updateVoiceStatus = (id, status) => {
    if (!id || !canUpdate(id)) return;

    const requestKey = `${id}-${status}`;
    if (activeRequests.has(requestKey)) return;
    
    activeRequests.set(requestKey, true);

    const req = request({
        host: 'discord.com',
        path: `/api/v10/channels/${id}/voice-status`,
        method: 'PUT',
        headers: { 
            'Authorization': `Bot ${token}`, 
            'Content-Type': 'application/json'
        },
        timeout: VOICE_STATUS_TIMEOUT,
    }, (res) => {
        activeRequests.delete(requestKey);
        if (res.statusCode !== 204) {
            console.error(`Voice status failed: ${res.statusCode}`);
        }
    });

    req.on('error', (err) => {
        activeRequests.delete(requestKey);
        console.error('Voice status request error:', err.message);
    });
    
    req.on('timeout', () => {
        activeRequests.delete(requestKey);
        req.destroy();
    });

    req.write(JSON.stringify({ status }));
    req.end();
};

const truncateText = (text, length = MAX_TITLE_LENGTH) => {
    if (!text || text.length <= length) return text;
    return `${text.slice(0, length - 3)}...`;
};

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
                        content: `### [${truncateText(title)}](${uri})`
                    },
                    {
                        type: 10,
                        content: `\`${formatTime(position)}\` ${bar} \`${formatTime(length)}\`\n\n${volIcon} \`${volume}%\` ${loopIcon} \`${track.requester?.username || 'Unknown'}\``
                    }
                ],
                accessory: {
                    type: 11,
                    media: {
                        url: track.thumbnail || client.me?.avatarURL({ extension: 'png' }) || ''
                    }
                }
            },
            {
                type: 14,
                divider: true,
                spacing: 2
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
};

aqua.on("trackStart", async (player, track) => {
    const channel = getChannel(player.textChannel);
    if (!channel) {
        console.warn(`Channel not found for player: ${player.textChannel}`);
        return;
    }

    try {
        const embed = createEmbed(player, track);
        player.cachedEmbed = embed;
        
        const [messageResult] = await Promise.allSettled([
            channel.client.messages.write(channel.id, { 
                components: [embed], 
                flags: 4096 | 32768 
            })
        ]);

        if (messageResult.status === 'fulfilled') {
            player.nowPlayingMessage = messageResult.value;
        } else {
            console.error("Failed to send now playing message:", messageResult.reason);
        }

        const voiceStatusText = `⭐ ${truncateText(track.info?.title || track.title, 40)} - Kenium 3.70`;
        updateVoiceStatus(player.voiceChannel, voiceStatusText);
        
    } catch (error) {
        console.error("Track start error:", error);
    }
});

aqua.on("trackError", async (player, track, payload) => {
    const channel = getChannel(player.textChannel);
    if (!channel) return;

    const errorMsg = payload.exception?.message || 'Unknown error';
    const trackTitle = track.info?.title || track.title || 'Unknown track';
    
    console.error(`Track error: ${errorMsg}`);
    
    try {
        await channel.client.messages.write(channel.id, { 
            content: `❌ Error playing **${truncateText(trackTitle, 30)}**:\n\`${truncateText(errorMsg, 100)}\`` 
        });
    } catch (error) {
        console.error("Failed to send error message:", error);
    }
});

aqua.on("playerDestroy", (player) => {
    const voiceChannel = player._lastVoiceChannel || player.voiceChannel;
    if (voiceChannel) {
        updateVoiceStatus(voiceChannel, null);
    }
    
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
});

aqua.on("queueEnd", (player) => {
    if (player.voiceChannel) {
        updateVoiceStatus(player.voiceChannel, null);
    }
    
    player.nowPlayingMessage = null;
    player.cachedEmbed = null;
});

aqua.on('nodeError', (node, error) => {
    console.error(`Node error [${node.name}]:`, error);
});

aqua.on('nodeConnect', (node) => {
    console.log(`Node connected: ${node.name}`);
});


const gracefulShutdown = () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

client.start().then(() => {
    console.log('Bot started successfully');
    return client.uploadCommands({ cachePath: "./commands.json" });
}).catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});

// @ts-ignore
client.cooldown = new CooldownManager(client);

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>>, ParseClient<HttpClient> {
        aqua: InstanceType<typeof Aqua>;
    }
    interface UsingClient {
        cooldown: CooldownManager;
    }
    interface RegisteredMiddlewares extends ParseMiddlewares<typeof middlewares> { }
}