const { request } = require('undici');
const { SlashCommandBuilder } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();
const NETQUEUE_TOKEN = process.env.NETQUEUE_TOKEN;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battletag')
		.setDescription('Register your battletag to set your starting SR')
		.addStringOption(option =>
			option.setName('account')
				.setDescription('BattleTag#12345')
				.setRequired(true)),
	async execute(interaction) {
		await interaction.deferReply();
		const battleTag = interaction.options.getString('account');
		const playerId = battleTag.replace('#', '-');
		const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
		if (response.statusCode != 200) {
			await interaction.editReply(`Invalid battletag: ${battleTag}`);
			return;
		}

		const playerSummary = await response.body.json();
		const skillRating = computeSkillRating(playerSummary);
		if (skillRating == UNRANKED_SR) {
			await interaction.editReply(
				`${battleTag} is either unranked or private. Defaulting to ${skillRating} SR.`);
		} else {
			await interaction.editReply(`Found ${battleTag} with peak ${skillRating} SR.`);
		}

		await registerIGN(interaction.user.id, interaction.channelId, battleTag);
		await registerMMR(interaction.user.id, interaction.channelId, skillRating);
		await interaction.followUp(`Registered ${interaction.user.displayName}'s IGN to ${battleTag} and MMR to ${skillRating}`);
	},
};


async function registerIGN(playerId, channelId, battleTag) {
	console.log(`Registered ${playerId}'s IGN in ${channelId} to ${battleTag}`);
}


async function registerMMR(playerId, channelId, skillRating) {
	try {
		const response = await request('https://api.neatqueue.com/api/player/rating', {
			method: 'POST',
			headers: {
				'authorization': NETQUEUE_TOKEN,
				'content-type': 'application/json',
			},
			body: JSON.stringify({
				player_id: playerId,
				channel_id: channelId,
				mmr: skillRating,
			}),
		});
		console.log(`Registered ${playerId}'s MMR in ${channelId} to ${skillRating}`);
	} catch (error) {
		console.error(error);
	}
}


const base_sr = {
	'grandmaster': 4000,
	'master': 3500,
	'diamond': 3000,
	'platinum': 2500,
	'gold': 2000,
	'silver': 1500,
	'bronze': 1000,
};
const UNRANKED_SR = 500;


function computeSkillRating(playerSummary) {
	if (playerSummary.competitive == null) return UNRANKED_SR;

	const { pc, console } = playerSummary.competitive;
	return Math.max(peakSr(pc), peakSr(console));
}


function peakSr(profile) {
	if (profile == null) return UNRANKED_SR;

	const { tank, damage, support } = profile;
	return Math.max(getRoleSr(tank), getRoleSr(damage), getRoleSr(support));
}


function getRoleSr(role) {
	if (role == null) return UNRANKED_SR;

	const { division, tier } = role;
	return base_sr[division] + 100 * (5 - tier);
}
