const { request } = require('undici');
const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });
const NETQUEUE_API_SECRET = process.env.NETQUEUE_API_SECRET;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battletag')
		.setDescription('Register your battletag to Neatqueue')
		.addStringOption(option =>
			option.setName('account')
				.setDescription('BattleTag#12345')
				.setRequired(true)),
	async execute(interaction) {
		try {
			await interaction.deferReply({ ephemeral: false });

			const battleTag = interaction.options.getString('account');

			const playerId = interaction.user.id;
			const queueChannels = await getAllQueueChannels(interaction.guildId);
			for (const queueChannel of queueChannels) {
				const channelId = queueChannel[0];
				const channelName = queueChannel[1];
				await registerIGN(playerId, channelId, battleTag);
				console.log(`Registered <@${playerId}>'s IGN as ${battleTag} in ${channelName}.`);
			}
			await interaction.editReply({
				content: `Registered <@${playerId}>'s IGN as ${battleTag}.`,
				ephemeral: false,
			});
		} catch (err) {
			console.error(err);
			if (typeof err === 'string' || err instanceof String) {
				await interaction.editReply({
					content: err,
					ephemeral: false,
				});
			}
		}
	},
};

async function getAllQueueChannels(serverId) {
	const response = await request(`https://api.neatqueue.com/api/queuechannels/${serverId}`, {
		method: 'GET',
		headers: {
			'authorization': NETQUEUE_API_SECRET,
			'content-type': 'application/json',
		},
	});

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(response.body.json());
		} else {
			console.error(response);
			reject(`Failed to get all queue channels from Neatqueue API`);
		}
	});
}

async function registerIGN(playerId, channelId, battleTag) {
	const response = await request('https://api.neatqueue.com/api/v2/set/ign', {
		method: 'POST',
		headers: {
			'authorization': NETQUEUE_API_SECRET,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			channel_id: channelId,
			account: battleTag,
			user_id: playerId
		}),
	});

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(response.body.json());
		} else {
			console.error(response);
			reject(`Failed to post IGN=${battleTag} to Neatqueue API`);
		}
	});
}
