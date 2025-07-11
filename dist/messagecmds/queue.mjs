import { EmbedBuilder, ContainerBuilder } from "discord.js";

export const Command = {
    name: "queue",
    description: "Show the music queue",

    run: async (client, message) => { 
        const player = client.aqua.players.get(message.guildId);
        if (!player) {
            return message.reply("🔇 Nothing is currently playing.");
        }

        const userVoiceChannelId = message.member.voice.channelId;
        const botVoiceChannelId = message.guild.members.me?.voice.channelId;

        if (!userVoiceChannelId) {
            return message.reply("❌ You need to join a voice channel first.");
        }

        if (botVoiceChannelId && botVoiceChannelId !== userVoiceChannelId) {
            return message.reply("❌ You need to be in the same voice channel as the bot.");
        }

        try {
            return await handleShowQueue(client, message, player);
        } catch (error) {
            console.error("Queue command error:", error);
            return message.reply("⚠️ An error occurred while processing your request.");
        }
    }
};

function formatDuration(ms) {
    if (ms <= 0) return "0:00";

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}


async function handleShowQueue(client, message, player) {
    const queueLength = player.queue.length;

    if (queueLength === 0) {
        const emptyEmbed = new EmbedBuilder()
            .setTitle('🎵 Queue')
            .setDescription("📭 Queue is empty. Add some tracks!")
            .setColor(0x000000)
            .setTimestamp();
        return message.reply({ embeds: [emptyEmbed] });
    }

    const embed = createQueueEmbed(client, message, player, 1);

    await message.reply({
        components: [embed],
        flags: 32768 // components v2 lol
    });

    const replyMessage = await message.fetchReply();

    const collector = replyMessage.createMessageComponentCollector({
        time: 300000, // 5 minutes
        filter: i => i.user.id === message.author.id && i.customId.startsWith('queue_')
    });

    collector.on('collect', async i => {
        try {
            await i.deferUpdate();

            const [, action] = i.customId.split('_');
            const currentPage = parseInt(i.message.components[0].components[0].components[1].content.match(/Page (\d+)/)[1]);
            const maxPages = Math.ceil(player.queue.length / 10);

            let newPage = currentPage;

            switch (action) {
                case 'first': newPage = 1; break;
                case 'prev': newPage = Math.max(1, currentPage - 1); break;
                case 'next': newPage = Math.min(maxPages, currentPage + 1); break;
                case 'last': newPage = maxPages; break;
                case 'refresh': break;
            }

            const newEmbed = createQueueEmbed(client, message, player, newPage);

            await i.editReply({
                components: [newEmbed],
                flags: 32768 // components v2 lol
            });

            collector.resetTimer();
        } catch (error) {
            console.error("Button message error:", error);
        }
    });

    collector.on('end', async () => {
        try {
            await replyMessage.delete();
        } catch (error) {
            console.error("Failed to delete message:", error);
        }
    });
}


function createQueueEmbed(client, message, player, page) {
    const tracksPerPage = 10;
    const queueLength = player.queue.length;
    const maxPages = Math.ceil(queueLength / tracksPerPage);

    const validPage = Math.max(1, Math.min(page, maxPages));
    const startIndex = (validPage - 1) * tracksPerPage;
    const endIndex = Math.min(startIndex + tracksPerPage, queueLength);

    const currentTrack = player.current;

    let queueContent = [];

    if (currentTrack) {
        queueContent.push(`**### ▶️ Now Playing: [${currentTrack.info.title}](${currentTrack.info.uri}) \`${formatDuration(currentTrack.info.length)}\`**`);
    }

    if (queueLength > 0) {
        queueContent.push("**__Queue:__**\n");

        const queueItems = player.queue.slice(startIndex, endIndex).map((track, i) =>
            `**${startIndex + i + 1}.** [**\`${track.info.title}\`**](${track.info.uri}) \`${formatDuration(track.info.length)}\``
        );

        queueContent = [...queueContent, ...queueItems];

        const totalDuration = player.queue.reduce((total, track) => total + track.info.length, 0);

        queueContent.push(
            `\n**Total:** \`${queueLength}\` track${queueLength > 1 ? "s" : ""} • **Duration:** \`${formatDuration(totalDuration)}\``
        );
    }

    return new ContainerBuilder({
        components: [
            {
                type: 9,
                components: [
                    {
                        type: 10,
                        content: `${queueContent.join('\n')}`
                    },
                    {
                        type: 10,
                        content: `Page ${validPage} of ${maxPages}`
                    },
                ],
                accessory: {
                    type: 11,
                    media: {
                        url: currentTrack.thubnail || currentTrack.info.artworkUrl || client.user.displayAvatarURL(),
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
                        label: "◀◀",
                        style: 2,
                        custom_id: "queue_first",
                        disabled: validPage === 1
                    },
                    {
                        type: 2,
                        label: "◀",
                        style: 1,
                        custom_id: "queue_prev",
                        disabled: validPage === 1
                    },
                    {
                        type: 2,
                        label: "🔄",
                        style: 3,
                        custom_id: "queue_refresh"
                    },
                    {
                        type: 2,
                        label: "▶",
                        style: 1,
                        custom_id: "queue_next",
                        disabled: validPage === maxPages
                    },
                    {
                        type: 2,
                        label: "▶▶",
                        style: 2,
                        custom_id: "queue_last",
                        disabled: validPage === maxPages
                    }
                ]
            }
        ],
        accent_color: 0
    });
}