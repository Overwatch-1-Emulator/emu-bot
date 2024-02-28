const https = require('https');

function computeSR(playerSummary) {
    return JSON.stringify(playerSummary.competitive, null, 4);
}

function getSkillRating(battleTag) {
    const playerId = battleTag.replace('#', '-');
    const options = {
        hostname: 'overfast-api.tekrop.fr',
        path: `/players/${playerId}/summary`,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const req = https.request(options, (res) => {
        console.log('statusCode:', res.statusCode);
        console.log('headers:', res.headers);

        res.on('data', (d) => {
            const playerSummary = JSON.parse(d.toString());
            console.log(computeSR(playerSummary));
        });
    });

    req.on('error', (e) => {
        console.error(e);
    });

    req.end();
}

getSkillRating('OombaLoomba#1417');