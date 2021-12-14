//------------------//
//----- CONFIG -----//
//------------------//

const dir = '.';
const minToMs = 60000;

//----------------//
//----- INIT -----//
//----------------//

console.log('Initializing...');

const config = require(`${dir}/config/config.json`);
const {
  HOST_NAME,
  IMG_URL,
  BOT_TOKEN,
  API_KEY,
  ACCOUNT_ID,
  SUMMONER_INFO,
  CHANNEL_ID,
  INTERVAL_MINUTES,
  EXIPRATION_MINUTES
} = config;

const Discord = require('discord.js');
const Https = require('https');
const Fs = require('fs');

let lastGame = '';
let gameInfo = '';
let notify = 1;
let timeRunning = 0;
let wait = false;

const matchlistGetOpts = {
  method: 'GET',
  hostname: HOST_NAME,
  path: `/lol/match/v5/matches/by-puuid/${ACCOUNT_ID}/ids`,
  headers: {
    'X-Riot-Token': API_KEY
  }
};

const getMatchGetOpts = matchId => ({
  method: 'GET',
  hostname: HOST_NAME,
  path: `/lol/match/v5/matches/${matchId}`,
  headers: {
    'X-Riot-Token': API_KEY
  }
});

const client = new Discord.Client();
client
  .login(BOT_TOKEN)
  .then(
    () => {
      console.log('Starting script...');

      setInterval(() => {
        timeRunning += 60;
        console.log('\n', `# Bot running: for ${timeRunning} minutes.`, '\n');
      }, 60 * minToMs);

      setInterval(() => {
        if (wait == true) {
          console.log('waiting for Discord...');
          return;
        }
        console.log('Attempting to update summoner profile...');
        console.log(`Making GET request to ${HOST_NAME}`);

        lastGame = '';
        const reqMatchlistGet = Https.request(matchlistGetOpts, res => {
          console.log(`HTTPS call complete with status: ${res.statusCode}`, '\n');

          res.on('data', data => {
            // process.stdout.write(data);
            lastGame += data;
          });

          res.on('end', () => {
            lastGame = JSON.parse(lastGame)[0];

            if (!lastGame) {
              console.log(`Failed to retrieve game. Received: ${JSON.stringify(lastGame)}`);
              return;
            }

            const lastGameId = Fs.readFileSync(`${dir}/config/last-game.id`).toString().replace(/\"/g, '');

            if (lastGameId != lastGame) {
              Fs.writeFileSync(`${dir}/config/last-game.id`, JSON.stringify(lastGame));
              gameInfo = '';

              console.log(`Last game updated to game ${lastGame}`, '\n');
              console.log(`Attempting to retrieve match results...`);

              const reqMatchGet = Https.request(getMatchGetOpts(lastGame), res => {
                console.log(`HTTPS call complete with status: ${res.statusCode}`, '\n');

                res.on('data', data => {
                  // process.stdout.write(data);
                  gameInfo += data;
                });

                res.on('end', () => {
                  gameInfo = JSON.parse(gameInfo);
                  const date = new Date(gameInfo.info.gameEndTimestamp);

                  if (date && Date.now() - date.getTime() <= EXIPRATION_MINUTES * minToMs) {
                    console.log(`Found game on ${date.toUTCString()}`, '\n');

                    formatGameInfo();
                    const { result, reason } = condition();

                    if (result) {
                      main();
                    } else {
                      console.log(`Game does not satisfy condition: ${reason}`, '\n');
                    }
                  } else if (date) {
                    console.log(`Game expired, ended over ${EXIPRATION_MINUTES} min ago.`, '\n');
                  } else {
                    console.log(`Failed to retrieve game info`, '\n');
                  }
                });
              });

              reqMatchGet.on('error', err => console.error(`HTTPS ERROR: ${err}`, '\n'));
              reqMatchGet.end();
            } else {
              console.log(`No new games`, '\n');
            }
          });
        });

        reqMatchlistGet.on('error', err => console.error(`HTTPS ERROR: ${err}`, '\n'));
        reqMatchlistGet.end();
      }, INTERVAL_MINUTES * minToMs);

      console.log('Initialized sucessfully.', '\n');
      console.log('*beep-boop*', '\n');
    },
    e => console.log(`Error connecting to Discord: ${e}`)
  )
  .catch(e => console.log(`Error connecting to Discord: ${e}`));

//----------------------------//
//----- SCRIPT CONDITION -----//
//----------------------------//

function condition() {
  const participant = getGameInfo('participant');
  const itemsIds = Object.values(getGameInfo('items'));
  return {
    result: participant.championName === 'Thresh' && itemsIds.includes(3071),
    reason: 'Black Cleaver Thresh'
  };
}

//------------------//
//----- SCRIPT -----//
//------------------//

function main() {
  const msg = new Discord.MessageEmbed()
    .setColor('#00ff99')
    .setTitle(`${SUMMONER_INFO.USERNAME} Strikes Again!`)
    .setURL(SUMMONER_INFO.SUMMARY_URL)
    .setDescription(`${SUMMONER_INFO.NAME} Bought Black Cleaver on Thresh.`)
    .setThumbnail(`${IMG_URL}/3071.png`)
    .addFields(
      { name: getGameInfo('participant').win ? 'Victory!' : 'Defeat...', value: getSummary() },
      { name: 'KDA', value: getKDA(), inline: true },
      { name: 'CC Score', value: getCCScore(), inline: true },
      { name: 'Vision Score', value: getVisionScore(), inline: true }
    )
    .setTimestamp()
    .setFooter('haney-bot-js', `${IMG_URL}/dev.png`);
  sendMessage(msg);
}

//-----------------//
//----- TOOLS -----//
//-----------------//

function sendMessage(msg) {
  wait = true;
  const targetChannel = client.channels.cache.find(channel => channel.id === CHANNEL_ID);
  console.log(`Attempting to contact channel ${targetChannel.name}...`);
  try {
    client.channels
      .resolve(CHANNEL_ID)
      .send(msg)
      .then(() => {
        wait = false;
      });
  } catch (e) {
    console.log(`Failed to reach channel ${e}`);
    wait = false;
  }
}

function getGameInfo(type) {
  const infoMap = {
    info: gameInfo.info,
    participant: gameInfo.info.participants[0],
    items: gameInfo.info.items,
    teams: gameInfo.info.teams
  };
  return infoMap[type];
}

function formatGameInfo() {
  const items = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5'];
  gameInfo.info.items = {};

  gameInfo.info.participants = gameInfo.info.participants.filter(player => player.puuid === ACCOUNT_ID);
  items.forEach(itemName => (gameInfo.info.items[itemName] = gameInfo.info.participants[0][itemName]));
  gameInfo.info.teams = {
    winner: gameInfo.info.teams.filter(team => team.win)[0],
    loser: gameInfo.info.teams.filter(team => !team.win)[0]
  };
}

function getSummary() {
  const info = getGameInfo('info');
  const teams = getGameInfo('teams');
  const participant = getGameInfo('participant');

  const diff = teams.winner.objectives.tower.kills - teams.loser.objectives.tower.kills;
  const gameTime = `${Math.floor(info.gameDuration / 60)} min ${info.gameDuration % 60} sec`;
  let victoryType = '';
  let firstBloodResult = '';
  let firstTowerResult = '';

  if (diff >= 4) {
    if (participant.win) {
      victoryType = 'A crushing victory';
    } else {
      victoryType = 'A sobering defeat';
    }
  } else if (diff >= 0) {
    if (participant.win) {
      victoryType = 'A calculated win';
    } else {
      victoryType = 'A hard-fought loss';
    }
  } else {
    if (participant.win) {
      victoryType = 'An impossible comeback';
    } else {
      victoryType = 'An absolute boondoggle';
    }
  }

  if (participant.firstBloodKill || participant.firstBloodAssist) {
    firstBloodResult = 'First Blood secured.';
  }

  if (participant.firstTowerKill || participant.firstTowerAssist) {
    firstTowerResult = 'First Tower destroyed.';
  }

  return `${victoryType}, lasting ${gameTime}. ${firstBloodResult} ${firstTowerResult}`;
}

function getKDA() {
  const participant = getGameInfo('participant');
  return `${participant.kills}/${participant.deaths}/${participant.assists}`;
}

function getGold() {
  return getGameInfo('participant')
    .goldEarned.toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function getVisionScore() {
  return getGameInfo('participant').visionScore;
}

function getCCScore() {
  const participant = getGameInfo('participant');
  return getGameInfo('participant').timeCCingOthers;
}
