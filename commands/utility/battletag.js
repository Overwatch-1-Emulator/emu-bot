const { request } = require('undici');
const { SlashCommandBuilder } = require('discord.js');
const dotenv = require('dotenv');
dotenv.config();
const NETQUEUE_TOKEN = process.env.NETQUEUE_TOKEN;
const BATTLETAG_ROLE_NAME = 'Emu battletag';

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
				.setDescription('BattleTag#12345')
				.setRequired(true)),
	async execute(interaction) {
		await interaction.deferReply();

		const guild = interaction.guild;
		let battletagRole = guild.roles.cache.find(r => r.name === BATTLETAG_ROLE_NAME);
		if (battletagRole == null) { // create battletag role if not exist
			await interaction.editReply(`${BATTLETAG_ROLE_NAME} role does not exist. Creating one now.`);
			battletagRole = await guild.roles.create({
				name: BATTLETAG_ROLE_NAME,
				reason: 'Role created by Emu for /battletag command'
			});
		}
		const member = interaction.member; // member who used the command
		if (member.roles.cache.has(battletagRole.id)) { // exit if member already part of battletag role
			await interaction.editReply(`You have already registered your battletag.`);
			return;
		}

		const battleTag = interaction.options.getString('account');
		const playerId = battleTag.replace('#', '-');
		const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
		if (response.statusCode != 200) {
			await interaction.editReply(`Invalid battletag: ${battleTag}`);
			return;
		}

		const playerSummary = await response.body.json();
		let skillRating = computeSkillRating(playerSummary);
		if (skillRating == UNRANKED) {
			await interaction.editReply(
				`${battleTag} is either unranked or private. Defaulting to ${defaultSkillRating} SR.`);
				skillRating = defaultSkillRating;
		} else {
			await interaction.editReply(`Found ${battleTag} with peak ${skillRating} SR.`);
		}

		await registerIGN(interaction.user.id, interaction.channelId, battleTag);
		await registerMMR(interaction.user.id, interaction.channelId, skillRating);
		await interaction.followUp(`Registered ${interaction.user.displayName}'s IGN to ${battleTag} and MMR to ${skillRating}.`);
		await member.roles.add(battletagRole); // Add battletag role to member
	},
};


async function registerIGN(playerId, channelId, battleTag) {
	console.log(`Registered user ${playerId}'s IGN to ${battleTag} in channel ${channelId}`);
}


async function registerMMR(playerId, channelId, skillRating) {
	try {
		await request('https://api.neatqueue.com/api/player/rating', {
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
		console.log(`Registered user ${playerId}'s MMR to ${skillRating} in channel ${channelId}`);
	} catch (error) {
		console.error(error);
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
