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
			await interaction.deferReply({ ephemeral: true });

			const battleTag = interaction.options.getString('account');

			const playerId = interaction.user.id;
			const channelId = interaction.channelId;
			await registerIGN(playerId, channelId, battleTag);
			await interaction.editReply({
				content: `Registered <@${playerId}>'s IGN to ${battleTag}.`,
				ephemeral: true,
			});
		} catch (err) {
			console.error(err);
			if (typeof err === 'string' || err instanceof String) {
				await interaction.editReply({
					content: err,
					ephemeral: true,
				});
			}
		}
	},
};

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
	const responseBody = await response.body.json();

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(responseBody);
		} else {
			console.error(responseBody);
			reject(`Failed to post IGN=${battleTag} to Neatqueue API`);
		}
	});
}
