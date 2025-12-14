import {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    ChatInputCommandInteraction,
    ApplicationCommandOptionType,
    ChannelType,
    GuildMember,
    VoiceChannel,
} from 'discord.js';
import config from './config.js';
import { EndBehaviorType, getVoiceConnection, VoiceConnectionStatus, entersState, joinVoiceChannel } from '@discordjs/voice';
import path from 'path';
import fs from 'fs';
import * as prism from 'prism-media';
import { randomUUID } from 'crypto';
import { pipeline } from 'node:stream/promises';

const client = new Client({
    intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.Guilds],
});

console.log(config)

const stopRecordingById = {}
const stopUserRecording = {}
// Ensure folder exists
if (!fs.existsSync(config.RECORDINGS_FOLDER)) fs.mkdirSync(config.RECORDINGS_FOLDER);

// Slash command registration
const commands = [
    {
        name: 'record',
        description: 'Record a voice channel',
        options: [
            {
                name: 'channel',
                description: 'The voice channel to record',
                type: ApplicationCommandOptionType.Channel,
                channel_types: [ChannelType.GuildVoice],
            },
        ],
    },
    {
        name: 'stop',
        description: 'Stop recording on this server',
    },
];

const rest = new REST().setToken(config.BOT_TOKEN);

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (!config.AUTHORIZED_USERS.some(u => u == interaction.user.id)) {
        return interaction.reply({ content: 'User not authorized', ephemeral: true });
    }

    if (interaction.commandName === 'record') {
        await handleRecord(interaction);
    } else if (interaction.commandName === "stop") {
        await handleStop(interaction)
    }
});

/**
 * 
 * @param {ChatInputCommandInteraction} interaction 
 * @returns 
 */
async function handleStop(interaction) {
    const stopper = stopRecordingById[interaction.guildId]
    if (stopper) stopper()
    await interaction.reply(`🎙️ Recording stopped`);
}

/**
 * 
 * @param {ChatInputCommandInteraction} interaction 
 * @returns 
 */
async function handleRecord(interaction) {
    /**
     * @type {VoiceChannel}
     */
    const channel = interaction.options.getChannel('channel');

    if (!channel) {
        return interaction.reply({ content: 'Please select a voice channel.', ephemeral: true });
    }

    if (channel.type !== ChannelType.GuildVoice) {
        return interaction.reply({ content: 'Please select a valid voice channel.', ephemeral: true });
    }

    const sessionId = randomUUID();
    await interaction.reply(`🎙️ Recording \`${sessionId}\`started in **${channel.name}**`);

    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        selfDeaf: false,
        selfMute: false,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    const sessionFolder = path.join(config.RECORDINGS_FOLDER, `${sessionId}_${new Date().toISOString()}`)

    fs.mkdirSync(sessionFolder);

    channel.members.forEach(member => startRecording(member, channel, sessionFolder));
    connection.receiver.speaking.on('start', async (userId) => {
        let user = channel.guild.members.cache.get(userId)
        if (!user) {
            await channel.guild.members.fetch()
            user = channel.guild.members.cache.get(userId)
        }
        startRecording(user, channel, sessionFolder)
    })
    connection.receiver.speaking.on('end', async (userId) => {
        stopRecording(userId)
    })
    stopRecordingById[interaction.guildId] = () => {
        connection.disconnect()
    }
}

function stopRecording(userId) {
    if (stopUserRecording[userId]) {
        stopUserRecording[userId]()
        delete stopUserRecording[userId]
    }
}

// --- Audio capture per user ---
/**
 * 
 * @param {GuildMember} member 
 * @param {VoiceChannel} channel 
 * @returns 
 */
async function startRecording(member, channel, sessionFolder) {
    if (member.user.bot) return;

    const connection = getVoiceConnection(channel.guild.id);
    if (!connection) return;

    const receiver = connection.receiver;

    const userId = member.id;
    const username = member.user.username;

    console.log(`Recording user: ${username}`);

    const opusStream = receiver.subscribe(userId, {
        end: {
            behavior: EndBehaviorType.Manual,
        },
    });
    stopRecording(userId)
    stopUserRecording[userId] = () => opusStream.destroy();

    const userFolder = path.join(sessionFolder, username);
    if (!fs.existsSync(userFolder)) fs.mkdirSync(userFolder);
    const output = fs.createWriteStream(path.join(userFolder, `${Date.now()}.ogg`));
    const oggStream = new prism.opus.OggLogicalBitstream({
        opusHead: new prism.opus.OpusHead({
            channelCount: 2,
            sampleRate: 48_000,
        }),
        pageSizeControl: {
            maxPackets: 10,
        },
    });

    try {
        await pipeline(opusStream, oggStream, output);
    } catch (error) {
        if (error.message === "Premature close") {
            console.log(`✅ Recorded ${username}`);
        } else {
            console.warn(`❌ Error recording ${username} - ${error.message}`);
        }
    }

}

client.login(config.BOT_TOKEN).then(async () => {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands, auth: true });
    console.log('Commands registered.');
});
