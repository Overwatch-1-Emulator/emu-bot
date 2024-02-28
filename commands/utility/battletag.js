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
		const battleTag = interaction.options.getString('account');
		const playerId = battleTag.replace('#', '-');
		const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
		const playerSummary = await response.body.json();

		// Exit on invalid battletag
		if (response.statusCode != 200) {
			await interaction.editReply(`Invalid battletag: ${battleTag}`);
			return;
		}

		const skillRating = computeSkillRating(playerSummary);
		if (skillRating == UNRANKED_SR) {
			await interaction.editReply(
				`${battleTag} is either unranked or private. Defaulting to ${skillRating} SR.`);
		} else {
			await interaction.editReply(`Found ${battleTag} with peak ${skillRating} SR.`);
		}

		registerIGN(interaction.user.id, interaction.channelId, battleTag);
		registerMMR(interaction.user.id, interaction.channelId, skillRating);
		interaction.followUp(`Registered ${interaction.user.displayName}'s IGN to ${battleTag} and MMR to ${skillRating}`);
	},
};


function registerIGN(playerId, channelId, battleTag) {
	console.log(`Registered ${playerId}'s IGN in ${channelId} to ${battleTag}`);
}


function registerMMR(playerId, channelId, skillRating) {
	const response = request('https://api.neatqueue.com/api/player/rating', {
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

	const platformSkillRatings = [];
	for (const platform in playerSummary.competitive) {
		const platformProfile = playerSummary.competitive[platform];
		platformSkillRatings.push(peakSr(platformProfile));
	}

	return Math.max(...platformSkillRatings);
}


function peakSr(profile) {
	if (profile == null) return UNRANKED_SR;
	return Math.max(getRoleSr(profile.tank), getRoleSr(profile.damage), getRoleSr(profile.support));
}


function getRoleSr(rank) {
	if (rank == null) return UNRANKED_SR;
	return base_sr[rank.division] + 100 * (5 - rank.tier);
}
