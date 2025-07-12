import { createEvent, Container } from 'seyfert';

const PROGRESS_CHARS = ['', '█', '██', '███', '████', '█████', '██████', '███████', '████████', '█████████', '██████████', '███████████', '████████████'];
const MAX_TITLE_LENGTH = 60;
const VOLUME_STEP = 10;
const MAX_VOLUME = 100;
const MIN_VOLUME = 0;

const formatTime = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const truncateText = (text, length = MAX_TITLE_LENGTH) => {
    if (!text || text.length <= length) return text;
    return `${text.slice(0, length - 3)}...`;
};

const createEmbed = (player, track, client) => {
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

const actionHandlers = {
    async volume_down(player, interaction) {
        const newVolume = Math.max(MIN_VOLUME, player.volume - VOLUME_STEP);
        player.setVolume(newVolume);
        return { content: `🔉 Volume set to ${newVolume}%` };
    },

    async previous(player, interaction) {
        if (!player.previous) {
            return { content: '❌ No previous track available' };
        }
        
        if (player.current) {
            player.queue.unshift(player.current);
        }
        
        player.queue.unshift(player.previous);
        player.stop();
        
        return { content: "⏮️ Playing the previous track." };
    },

    async resume(player, interaction) {
        await player.pause(false);
        return { content: "▶️ Resumed playback." };
    },

    async pause(player, interaction) {
        await player.pause(true);
        return { content: "⏸️ Paused playback." };
    },

    async skip(player, interaction) {
        if (player.queue.length === 0) {
            return { content: "❌ No tracks in queue to skip to." };
        }
        
        await player.skip();
        return { content: "⏭️ Skipped to the next track." };
    },

    async volume_up(player, interaction) {
        const newVolume = Math.min(MAX_VOLUME, player.volume + VOLUME_STEP);
        player.setVolume(newVolume);
        return { content: `🔊 Volume set to ${newVolume}%` };
    }
};

const updateNowPlayingEmbed = async (player, client) => {
    if (!player.nowPlayingMessage || !player.current) {
        return;
    }

    try {
        const updatedEmbed = createEmbed(player, player.current, client);
        
        await player.nowPlayingMessage.edit({ 
            components: [updatedEmbed], 
            flags: 4096 | 32768
        });
        
        player.cachedEmbed = updatedEmbed;
        
    } catch (error) {
        console.error("Error updating now playing message:", error);
        player.nowPlayingMessage = null;
        player.cachedEmbed = null;
    }
};

export default createEvent({
    data: {
        name: 'interactionCreate',
    },
    run: async (interaction, client) => {
        if (!interaction.isButton()) return;

        // Validate interaction data
        const { customId, guildId } = interaction;
        if (!customId || !guildId) {
            console.warn('Invalid interaction data:', { customId, guildId });
            return;
        }

        // Get player and validate
        const player = client.aqua.players.get(guildId);
        if (!player || !player.current) {
            try {
                await interaction.write({ 
                    content: "❌ There is no music playing right now.",
                    flags: 64 // Ephemeral
                });
            } catch (error) {
                console.error('Error sending no music response:', error);
            }
            return;
        }

        // Defer reply early to prevent timeout
        try {
            await interaction.deferReply(64); // Ephemeral
        } catch (error) {
            console.error('Error deferring reply:', error);
            return;
        }

        const handler = actionHandlers[customId];
        if (!handler) {
            try {
                await interaction.editOrReply({ 
                    content: "❌ This button action is not recognized." 
                });
            } catch (error) {
                console.error('Error sending unrecognized action response:', error);
            }
            return;
        }

        try {

            setTimeout(async () => {
             const response = await handler(player, interaction);

             await interaction.followup(response);
            }, 36);
            
        
            
            setTimeout(() => {
                updateNowPlayingEmbed(player, client);
            }, 36);
            
        } catch (error) {
            console.error(`Error handling ${customId} action:`, error);
            
            try {
                await interaction.editOrReply({ 
                    content: `❌ An error occurred while processing your request. Please try again.` 
                });
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    },
});