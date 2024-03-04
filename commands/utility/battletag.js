const { request } = require('undici');
const { SlashCommandBuilder } = require('discord.js');
require('dotenv').config({ path: `.env.${process.env.NODE_ENV}` });
const NETQUEUE_API_SECRET = process.env.NETQUEUE_API_SECRET;
const BATTLETAG_ROLE_NAME = 'Emu Battletag';

const base_sr = {
	'grandmaster': 4000,
	'master': 3500,
	'diamond': 3000,
	'platinum': 2500,
	'gold': 2000,
	'silver': 1500,
	'bronze': 1000,
};
const UNRANKED = 0;
const defaultSkillRating = base_sr.bronze;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battletag')
		.setDescription('Register your battletag to set your starting SR')
		.addStringOption(option =>
			option.setName('account')
				.setDescription('BattleTag#12345 (case-sensitive)')
				.setRequired(true)),
	async execute(interaction) {
		await interaction.deferReply({ ephemeral: false });

		const guild = interaction.guild;
		let battletagRole = guild.roles.cache.find(r => r.name === BATTLETAG_ROLE_NAME);
		if (battletagRole == null) { // create battletag role if not exist
			await interaction.editReply({
				content: `${BATTLETAG_ROLE_NAME} role does not exist. Creating one now.`,
				ephemeral: false
			});
			battletagRole = await guild.roles.create({
				name: BATTLETAG_ROLE_NAME,
				reason: 'Role created by Emu for /battletag command'
			});
		}
		const member = interaction.member; // member who used the command
		if (member.roles.cache.has(battletagRole.id)) { // exit if member already part of battletag role
			await interaction.editReply({
				content: `You have already registered your battletag.`,
				ephemeral: false,
			});
			return;
		}

		const battleTag = interaction.options.getString('account');
		const playerId = battleTag.replace('#', '-');
		const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
		if (response.statusCode != 200) {
			await interaction.editReply({
				content: `Invalid battletag: ${battleTag}`,
				ephemeral: false,
			});
			return;
		}

		const playerSummary = await response.body.json();
		const skillRating = computeSkillRating(playerSummary);
		let neatqueueMmr;
		if (skillRating == UNRANKED) {
			await interaction.editReply({
				content: `${battleTag} is either unranked or private. Defaulting to ${defaultSkillRating} SR.`,
				ephemeral: false,
			});
			neatqueueMmr = defaultSkillRating;
		} else {
			await interaction.editReply({
				content: `Found ${battleTag} with peak ${skillRating} SR.`,
				ephemeral: false,
			});
			neatqueueMmr = skillRating;
		}

		await registerIGN(interaction.user.id, interaction.channelId, battleTag);
		await registerMMR(interaction.user.id, interaction.channelId, neatqueueMmr);
		await interaction.editReply({
			content: `Registered <@${interaction.user.id}>'s IGN to ${battleTag} and MMR to ${neatqueueMmr}.`,
			ephemeral: false,
		});
		if (skillRating != UNRANKED) {
			await member.roles.add(battletagRole); // Add battletag role to member
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
	if (response.statusCode == 200) {
		console.log(`Registered user ${playerId}'s IGN to ${battleTag} in channel ${channelId}`);
	} else {
		console.error(responseBody);
	}
}


async function registerMMR(playerId, channelId, skillRating) {

	const response = await request('https://api.neatqueue.com/api/v2/set/mmr', {
		method: 'POST',
		headers: {
			'authorization': NETQUEUE_API_SECRET,
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			channel_id: channelId,
			mmr: skillRating,
			user_id: playerId
		}),
	});
	const responseBody = await response.body.json();
	if (response.statusCode == 200) {
		console.log(`Registered user ${playerId}'s MMR to ${skillRating} in channel ${channelId}`);
	} else {
		console.error(responseBody);
	}
}

function computeSkillRating(playerSummary) {
	if (playerSummary.competitive == null) return UNRANKED;

	const { pc, console } = playerSummary.competitive;
	return Math.max(peakSr(pc), peakSr(console));
}


function peakSr(profile) {
	if (profile == null) return UNRANKED;

	const { tank, damage, support } = profile;
	return Math.max(getRoleSr(tank), getRoleSr(damage), getRoleSr(support));
}


function getRoleSr(role) {
	if (role == null) return UNRANKED;

	const { division, tier } = role;
	return base_sr[division] + 100 * (5 - tier);
}
