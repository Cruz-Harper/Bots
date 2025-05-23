// ...your existing requires...
const { Client, GatewayIntentBits, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, EmbedBuilder, REST } = require('discord.js');
const { createCanvas } = require('canvas');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });

const userBracketState = new Map();
const brackets = new Map();
const checkIns = new Map();

function shuffleArray(array) {
  return array.map(a => [Math.random(), a]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
}

async function drawBracketImage(players, matchups, round, losersMatchups, grandFinalsMatch) {
  const width = 600;
  const numRows = (matchups ? matchups.length : 0) + (losersMatchups ? losersMatchups.length : 0) + (grandFinalsMatch ? 1 : 0);
  const height = Math.max(250, numRows * 40 + 80);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#23272a';
  ctx.fillRect(0, 0, width, height);

  ctx.font = '20px Sans';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Winners Bracket - Round ${round}`, 20, 30);

  let y = 60;
  if (matchups) {
    matchups.forEach((match, i) => {
      ctx.fillStyle = '#7289da';
      ctx.fillRect(20, y - 20, 460, 32);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${match[0]?.username || 'TBD'} vs ${match[1]?.username || 'BYE'}`, 30, y);
      y += 40;
    });
  }
  if (losersMatchups && losersMatchups.length > 0) {
    ctx.fillStyle = '#fff';
    ctx.fillText(`Losers Bracket`, 20, y + 10);
    y += 40;
    losersMatchups.forEach((match, i) => {
      ctx.fillStyle = '#da7272';
      ctx.fillRect(20, y - 20, 460, 32);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${match[0]?.username || 'TBD'} vs ${match[1]?.username || 'BYE'}`, 30, y);
      y += 40;
    });
  }
  if (grandFinalsMatch) {
    ctx.fillStyle = '#fff';
    ctx.fillText('Grand Finals', 20, y + 10);
    y += 40;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(20, y - 20, 460, 32);
    ctx.fillStyle = '#000';
    ctx.fillText(`${grandFinalsMatch[0]?.username || 'TBD'} vs ${grandFinalsMatch[1]?.username || 'TBD'}`, 30, y);
  }

  return canvas.toBuffer();
}

function generateMatchups(players) {
  const matchups = [];
  for (let i = 0; i < players.length; i += 2) {
    matchups.push([players[i], players[i + 1] || { username: 'BYE' }]);
  }
  return matchups;
}

// ==== DOUBLE ELIMINATION STATE HELPERS ====
function ensureDoubleElimState(bracket) {
  if (!bracket.losersBracket) bracket.losersBracket = [];
  if (!bracket.losersMatchups) bracket.losersMatchups = [];
  if (!bracket.losersCurrentMatchIndex) bracket.losersCurrentMatchIndex = 0;
  if (!bracket.losersRound) bracket.losersRound = 0;
  if (!bracket.finalStage) bracket.finalStage = false;
}

// ==== CHECK-IN HANDLERS ====

async function startCheckIn(match, channel, bracket, losersBracket = false, grandFinals = false) {
  const [p1, p2] = match;
  if (!p1 || !p2 || p1.username === 'BYE') return resolveMatch(p2, match, channel, bracket, losersBracket, grandFinals);
  if (p2.username === 'BYE') return resolveMatch(p1, match, channel, bracket, losersBracket, grandFinals);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkin_${p1.id}`).setLabel('Check In').setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkin_${p2.id}`).setLabel('Check In').setStyle(ButtonStyle.Success)
  );

  try {
    const user1 = await client.users.fetch(p1.id);
    await user1.send({ content: `You're up vs ${p2.username}! Click below to check in:`, components: [row1] });
  } catch (e) {}
  try {
    const user2 = await client.users.fetch(p2.id);
    await user2.send({ content: `You're up vs ${p1.username}! Click below to check in:`, components: [row2] });
  } catch (e) {}

  checkIns.set(`${p1.id}-${p2.id}-${losersBracket ? 'L' : grandFinals ? 'GF' : 'W'}`, {
    p1: false, p2: false, match, startTime: Date.now(), channelId: channel.id, losersBracket, grandFinals
  });
  setTimeout(() => handleCheckInTimeout(p1, p2, match, channel, bracket, losersBracket, grandFinals), 5 * 60 * 1000);
}

async function handleCheckInTimeout(p1, p2, match, channel, bracket, losersBracket = false, grandFinals = false) {
  const id = `${p1.id}-${p2.id}-${losersBracket ? 'L' : grandFinals ? 'GF' : 'W'}`;
  const result = checkIns.get(id);
  if (!result) return;
  if (result.p1 && result.p2) return;
  if (result.p1) return resolveMatch(p1, match, channel, bracket, losersBracket, grandFinals);
  if (result.p2) return resolveMatch(p2, match, channel, bracket, losersBracket, grandFinals);
  checkIns.delete(id);
  const ch = await client.channels.fetch(channel.id);
  ch.send(`⚠️ Match between ${p1.username} and ${p2.username} skipped due to no check-in.`);
  if (grandFinals) {
    bracket.finalStage = true; // Edge-case: skip to finish
  } else if (losersBracket) {
    bracket.losersCurrentMatchIndex++;
    runNextMatch(bracket, ch, true);
  } else {
    bracket.currentMatchIndex++;
    runNextMatch(bracket, ch);
  }
}

function resolveMatch(winner, match, channel, bracket, losersBracket = false, grandFinals = false) {
  if (!winner) {
    if (grandFinals) {
      channel.send(`🏆 Grand Finals could not be completed. No winner.`);
    }
    return;
  }
  const loser = match[0].id === winner.id ? match[1] : match[0];
  match.winner = winner;
  match.loser = loser;
  bracket.results.push({ round: bracket.round, match, winner, loser, losersBracket, grandFinals });
  channel.send(`✅ ${winner.username} wins the match against ${loser.username}`);
  if (grandFinals) {
    channel.send(`🏆 The tournament is over! Grand Finals Winner: **${winner.username}**`);
    bracket.finalStage = true;
    return;
  }
  if (losersBracket) {
    bracket.losersCurrentMatchIndex++;
    runNextMatch(bracket, channel, true);
  } else {
    bracket.currentMatchIndex++;
    runNextMatch(bracket, channel);
  }
}

// ==== DOUBLE ELIM LOGIC ====
function runNextMatch(bracket, channel, losersBracket = false) {
  if (bracket.format === 'double_elim') ensureDoubleElimState(bracket);

  // LOSERS BRACKET FLOW
  if (bracket.format === 'double_elim' && losersBracket) {
    if (bracket.losersCurrentMatchIndex >= bracket.losersMatchups.length) {
      const unresolved = bracket.losersMatchups.find(m => !m.winner);
      if (unresolved) {
        channel.send(`⏳ Waiting for a match between ${unresolved[0]?.username} and ${unresolved[1]?.username || 'BYE'} to finish in Losers Bracket.`);
        return;
      }
      const lWinners = bracket.losersMatchups.map(m => m.winner).filter(Boolean);
      if (lWinners.length === 1 && bracket.winnersBracketWinner) {
        // Grand Finals
        bracket.grandFinalsMatch = [bracket.winnersBracketWinner, lWinners[0]];
        bracket.finalStage = false;
        channel.send(`🔥 **GRAND FINALS**: ${bracket.winnersBracketWinner.username} (Winners Bracket) vs ${lWinners[0].username} (Losers Bracket)!`);
        startCheckIn(bracket.grandFinalsMatch, channel, bracket, false, true);
        return;
      }
      if (lWinners.length === 0) {
        bracket.losersMatchups = [];
      } else {
        bracket.losersMatchups = generateMatchups(lWinners);
        bracket.losersCurrentMatchIndex = 0;
        bracket.losersRound++;
        channel.send(`📢 Starting Losers Round ${bracket.losersRound}!`);
        runNextMatch(bracket, channel, true);
        return;
      }
    } else {
      const match = bracket.losersMatchups[bracket.losersCurrentMatchIndex];
      if (!match?.winner) {
        startCheckIn(match, channel, bracket, true);
      }
      return;
    }
  }

  // WINNERS BRACKET FLOW
  if (bracket.currentMatchIndex >= bracket.matchups.length) {
    const unresolved = bracket.matchups.find(m => !m.winner);
    if (unresolved) {
      channel.send(`⏳ Waiting for a match between ${unresolved[0]?.username} and ${unresolved[1]?.username || 'BYE'} to finish.`);
      return;
    }
    const winners = bracket.matchups.map(m => m.winner).filter(Boolean);
    const losers = bracket.matchups.map(m => m.loser).filter(Boolean);
    // WINNERS BRACKET FINISHED?
    if (winners.length === 1) {
      bracket.winnersBracketWinner = winners[0];
      if (bracket.format === 'double_elim') {
        if (!bracket.losersMatchups || bracket.losersMatchups.length === 0) {
          bracket.losersMatchups = generateMatchups(losers);
          bracket.losersCurrentMatchIndex = 0;
          bracket.losersRound = 1;
          channel.send('📢 Moving to Losers Bracket!');
          runNextMatch(bracket, channel, true);
          return;
        } else if (bracket.losersMatchups.length === 1 && bracket.losersMatchups[0].winner) {
          // Grand Finals
          bracket.grandFinalsMatch = [winners[0], bracket.losersMatchups[0].winner];
          bracket.finalStage = false;
          channel.send(`🔥 **GRAND FINALS**: ${winners[0].username} (Winners Bracket) vs ${bracket.losersMatchups[0].winner.username} (Losers Bracket)!`);
          startCheckIn(bracket.grandFinalsMatch, channel, bracket, false, true);
          return;
        } else {
          channel.send('Waiting for Losers Bracket to finish.');
        }
        return;
      } else {
        channel.send(`🏆 The tournament is over! Winner: **${winners[0].username}**`);
        return;
      }
    } else {
      bracket.matchups = generateMatchups(winners);
      bracket.round++;
      bracket.currentMatchIndex = 0;
      channel.send(`📢 Starting Winners Round ${bracket.round}!`);
      runNextMatch(bracket, channel);
      return;
    }
  } else {
    // Continue winners bracket
    const match = bracket.matchups[bracket.currentMatchIndex];
    if (!match.winner) {
      startCheckIn(match, channel, bracket, false);
    }
  }
}

// ========== MAIN INTERACTION HANDLER ==========
client.on('interactionCreate', async interaction => {
  // Handle Button Interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const userId = interaction.user.id;

    if (customId.startsWith('checkin_')) {
      const checkinId = customId.split('_')[1];
      let found = false;
      for (const [key, data] of checkIns.entries()) {
        if (key.includes(checkinId)) {
          try {
            data[checkinId === data.match[0].id ? 'p1' : 'p2'] = true;
            await interaction.reply({ content: '✅ Check-in successful!', ephemeral: true });
          } catch (err) {
            await interaction.reply({ content: '❌ An error occurred while checking in.', ephemeral: true });
          }
          found = true;
          break;
        }
      }
      if (!found) {
        await interaction.reply({ content: '❌ Match not found or already started.', ephemeral: true });
      }
      return;
    }

    if (customId === 'single_elim' || customId === 'double_elim') {
      const state = userBracketState.get(userId);
      if (!state || state.channelId !== interaction.channel.id) return;
      const bracket = {
        players: [],
        matchups: [],
        round: 1,
        currentMatchIndex: 0,
        format: customId,
        results: [],
        losersBracket: [],
        losersMatchups: [],
        losersCurrentMatchIndex: 0,
        losersRound: 0,
        grandFinalsMatch: null,
        finalStage: false,
        winnersBracketWinner: null
      };
      brackets.set(interaction.channel.id, bracket);
      await interaction.update({ content: 'Bracket created! Players can now /join.', components: [] });
      return;
    }
  }

  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const displayName = interaction.member?.nickname || interaction.member?.user?.globalName || interaction.user.globalName || interaction.user.username;
    const isAdmin = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);

    switch (interaction.commandName) {
      case 'startbracket': {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('single_elim').setLabel('Single Elimination').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('double_elim').setLabel('Double Elimination').setStyle(ButtonStyle.Secondary)
        );
        userBracketState.set(interaction.user.id, { step: 1, channelId: interaction.channel.id });
        await interaction.reply({ content: 'Choose elimination format:', components: [row] });
        break;
      }
      case 'join': {
        const bracket = brackets.get(interaction.channel.id);
        if (!bracket) return interaction.reply('No active bracket.');
        if (bracket.started) return interaction.reply('The tournament has already started. You cannot join now.');
        const player = { id: interaction.user.id, username: displayName };
        if (bracket.players.find(p => p.id === player.id)) return interaction.reply('You already joined.');
        bracket.players.push(player);
        await interaction.reply(`${displayName} joined the tournament.`);
        break;
      }
      case 'leave': {
        const bracket = brackets.get(interaction.channel.id);
        if (!bracket) return interaction.reply('No active bracket.');
        const playerId = interaction.user.id;
        const before = bracket.players.length;
        bracket.players = bracket.players.filter(p => p.id !== playerId);
        if (before === bracket.players.length) return interaction.reply('You are not in the bracket.');
        await interaction.reply(`${displayName} left the tournament.`);
        break;
      }
      case 'start': {
        const bracket = brackets.get(interaction.channel.id);
        if (!bracket || bracket.players.length < 2) return interaction.reply('Not enough players to start.');
        bracket.started = true;
        bracket.players = shuffleArray(bracket.players);
        bracket.matchups = generateMatchups(bracket.players);
        bracket.currentMatchIndex = 0;
        bracket.round = 1;
        bracket.results = [];
        bracket.losersBracket = [];
        bracket.losersMatchups = [];
        bracket.losersCurrentMatchIndex = 0;
        bracket.losersRound = 0;
        bracket.grandFinalsMatch = null;
        bracket.finalStage = false;
        bracket.winnersBracketWinner = null;
        await interaction.reply('🎮 Tournament starting!');
        runNextMatch(bracket, interaction.channel);
        break;
      }
      case 'bracket': {
        const bracket = brackets.get(interaction.channel.id);
        if (!bracket) return interaction.reply('No active bracket.');
        const buf = await drawBracketImage(
          bracket.players,
          bracket.matchups || [],
          bracket.round || 1,
          bracket.losersMatchups,
          bracket.grandFinalsMatch
        );
        await interaction.reply({
          files: [{ attachment: buf, name: 'bracket.png' }]
        });
        break;
      }
      case 'logwin': {
        const winner = interaction.options.getUser('winner');
        const loser = interaction.options.getUser('loser');
        const bracket = brackets.get(interaction.channel.id);
        if (!bracket) return interaction.reply({ content: '❌ No active bracket in this channel.', ephemeral: true });

        // Grand finals
        if (bracket.grandFinalsMatch && !bracket.finalStage) {
          const match = bracket.grandFinalsMatch;
          const winnerPlayer = match.find(p => p.id === winner.id);
          const loserPlayer = match.find(p => p.id === loser.id);
          if (!winnerPlayer || !loserPlayer) {
            return interaction.reply({ content: '❌ Those users are not in the current grand finals match.', ephemeral: true });
          }
          resolveMatch(winnerPlayer, match, interaction.channel, bracket, false, true);
          return;
        }

        // Winners bracket
        let match = bracket.matchups[bracket.currentMatchIndex];
        let winnerPlayer = match?.find(p => p && p.id === winner.id);
        let loserPlayer = match?.find(p => p && p.id === loser.id);

        if (!winnerPlayer || !loserPlayer) {
          // Losers bracket
          match = bracket.losersMatchups[bracket.losersCurrentMatchIndex];
          winnerPlayer = match?.find(p => p && p.id === winner.id);
          loserPlayer = match?.find(p => p && p.id === loser.id);
          if (!winnerPlayer || !loserPlayer) {
            return interaction.reply({ content: '❌ Those users are not in the current match.', ephemeral: true });
          }
          resolveMatch(winnerPlayer, match, interaction.channel, bracket, true, false);
          return;
        }
        resolveMatch(winnerPlayer, match, interaction.channel, bracket, false, false);
        break;
      }
      case 'about': {
        await interaction.reply("I am a tournament bot created by `@qmqz2`. I am used to smoothly and easily host tournaments for any game without the hassle of doing a million things. I'm in early development.");
        break;
      }
      case 'ping': {
        await interaction.reply("Pong! I'm alive! Ping: " + client.ws.ping)
        break;
      }
      case 'commands': {
        const embed = new EmbedBuilder()
          .setTitle('Available Commands')
          .setColor(0x00AE86)
          .setDescription(
            `/startbracket – Start a new tournament bracket and choose format (single or double elimination).\n` +
            `/join – Join the current tournament in this channel.\n` +
            `/leave – Leave the current tournament before it starts.\n` +
            `/start – Begin the tournament.\n` +
            `/bracket – Show the current bracket image.\n` +
            `/logwin – Admin-only: Log a win (for manual override).`
          );
        await interaction.reply({ embeds: [embed] });
        break;
      }
    }
  }
});

// ========== COMMAND REGISTRATION ==========
const commands = [
  new SlashCommandBuilder().setName('startbracket').setDescription('Start a new tournament bracket.'),
  new SlashCommandBuilder().setName('join').setDescription('Join the current tournament.'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave the current tournament.'),
  new SlashCommandBuilder().setName('start').setDescription('Begin the tournament.'),
  new SlashCommandBuilder().setName('bracket').setDescription('Show the current bracket.'),
  new SlashCommandBuilder().setName('logwin').setDescription('Log a win.')
    .addUserOption(option =>
      option.setName('winner').setDescription('Who won the match?').setRequired(true))
    .addUserOption(option =>
      option.setName('loser').setDescription('Who lost the match?').setRequired(true)),
  new SlashCommandBuilder().setName('about').setDescription('About the bot.'),
  new SlashCommandBuilder().setName('ping').setDescription('Ping the bot.'),
  new SlashCommandBuilder().setName('commands').setDescription('Show available commands.')
];

const rest = new REST({ version: '10' }).setToken(TOKEN2);
(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

async function notifyAllServers(message) {
  for (const guild of client.guilds.cache.values()) {
    try {
      // Try system channel first, fallback to any channel bot can send in
      const channel = guild.systemChannel 
        || guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me).has('SendMessages'));
      if (channel) {
        await channel.send(message);
      }
    } catch (e) {
      console.log(`Failed to notify guild ${guild.id}:`, e);
    }
  }
}

client.on('error', error => {
  console.error('Client error:', error);
  notifyAllServers('⚠️ Bot encountered an error and might go offline...');
});

client.once('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  notifyAllServers('✅ Bot has restarted and is now online!');
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  notifyAllServers('⚠️ Bot crashed due to an uncaught exception.');
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
  notifyAllServers('⚠️ Bot crashed due to an unhandled promise rejection.');
});

client.login(process.env.TOKEN2);

