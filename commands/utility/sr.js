const { request } = require('undici');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('sr')
		.setDescription('Find peak Overwatch SR from latest season')
		.addStringOption(option =>
			option.setName('battletag')
				.setDescription('Player IGN in the format BattleTag#12345')
				.setRequired(true)),
	async execute(interaction) {
		const battleTag = interaction.options.getString('battletag');
		const playerId = battleTag.replace('#', '-');
		const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
		const playerSummary = await response.body.json();
		const skillRating = computeSkillRating(playerSummary);

		if (skillRating == UNRANKED_SR) {
			await interaction.editReply(`${battleTag} is unranked. Defaulting SR to ${skillRating}.`);
		} else {
			await interaction.editReply(`${battleTag}'s peak SR is ${skillRating}.`);
		}
	},
};

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
