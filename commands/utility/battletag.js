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
const defaultSkillRating = base_sr.gold;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('battletag')
		.setDescription('Register your battletag to set your starting SR')
		.addStringOption(option =>
			option.setName('account')
				.setDescription('BattleTag#12345 (case-sensitive)')
				.setRequired(true)),
	async execute(interaction) {
		try {
			await interaction.deferReply({ ephemeral: true });

			const battletagRole = await getBattletagRole(interaction);
			if (interaction.member.roles.cache.has(battletagRole.id)) { // exit if member already part of battletag role
				await interaction.editReply({
					content: `You have already registered your battletag.`,
					ephemeral: true,
				});
				return;
			}

			const battleTag = interaction.options.getString('account');
			const playerSummary = await getPlayerSummary(battleTag);

			const skillRating = computeSkillRating(playerSummary);
			let assignedMmr;
			if (skillRating == UNRANKED) {
				await interaction.editReply({
					content: `${battleTag} is either unranked or private. Defaulting to ${defaultSkillRating} SR.`,
					ephemeral: true,
				});
				assignedMmr = defaultSkillRating;
			} else {
				await interaction.editReply({
					content: `Found ${battleTag} with peak ${skillRating} SR.`,
					ephemeral: true,
				});
				assignedMmr = skillRating;
			}
			
			const playerId = interaction.user.id;
			const channelId = interaction.channelId
			await registerIGN(playerId, channelId, battleTag);
			await registerMMR(playerId, channelId, assignedMmr);
			await interaction.editReply({
				content: `Registered <@${playerId}>'s IGN to ${battleTag} and MMR to ${assignedMmr}.`,
				ephemeral: true,
			});

			if (skillRating != UNRANKED) {
				await interaction.member.roles.add(battletagRole); // Add battletag role to member
			}
		} catch (err) {
			console.error(err)
			await interaction.editReply({
				content: err,
				ephemeral: true,
			});
		}
	},
};

async function getBattletagRole(interaction) {
	let battletagRole = interaction.guild.roles.cache.find(r => r.name === BATTLETAG_ROLE_NAME);
	if (battletagRole == null) { // create battletag role if it does not exist
		await interaction.editReply({
			content: `${BATTLETAG_ROLE_NAME} role does not exist. Creating one now.`,
			ephemeral: true
		});
		battletagRole = await interaction.guild.roles.create({
			name: BATTLETAG_ROLE_NAME,
			reason: 'Role created by Emu for /battletag command'
		});
	}

	return new Promise((resolve, reject) => {
		if (battletagRole != null) {
			resolve(battletagRole)
		} else {
			reject(`Could not find "${BATTLETAG_ROLE_NAME}" role.`)
		}
	})
}


async function getPlayerSummary(battleTag) {
	const playerId = battleTag.replace('#', '-');
	const response = await request(`https://overfast-api.tekrop.fr/players/${playerId}/summary`);
	const playerSummary = await response.body.json();

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(playerSummary)
		} else {
			console.error(playerSummary)
			reject(`Invalid battletag: could not find "${battleTag}" in https://overwatch.blizzard.com/en-us/search/`)
		}
	})
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
	const responseBody = await response.body.json();

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(responseBody)
		} else {
			console.error(responseBody)
			reject(`Failed to post IGN=${battleTag} to Neatqueue API`)
		}
	})
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

	return new Promise((resolve, reject) => {
		if (response.statusCode == 200) {
			resolve(responseBody)
		} else {
			console.error(responseBody)
			reject(`Failed to post MMR=${skillRating} to Neatqueue API`)
		}
	})
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
