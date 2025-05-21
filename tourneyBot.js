const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  Collection
} = require('discord.js');
const fs = require('fs');

// Keeps bot running and checking for commands:
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running!'));

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// Discord client setup:
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

const TOKEN2 = process.env.TOKEN2;
const CLIENT_ID = process.env.CLIENT_ID;

client.once('ready', () => {
  console.log(`✅ Tourney Bot is online as ${client.user.tag}`);
  client.user.setActivity('SSBU Rankings', { type: 'Watching' });
});

const userBracketState = new Map();
const brackets = new Map();
const checkIns = new Map();

function shuffleArray(array) {
  return array.map(a => [Math.random(), a]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
}

function generateMatchups(players) {
  const matchups = [];
  for (let i = 0; i < players.length; i += 2) {
    matchups.push([players[i], players[i + 1] || { username: 'BYE' }]);
  }
  return matchups;
}

async function startCheckIn(match, channel, bracket) {
  const [p1, p2] = match;
  if (p2.username === 'BYE') return resolveMatch(p1, match, channel, bracket);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkin_${p1.id}`).setLabel('Check In').setStyle(ButtonStyle.Success)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`checkin_${p2.id}`).setLabel('Check In').setStyle(ButtonStyle.Success)
  );

  try {
    const user1 = await client.users.fetch(p1.id);
    await user1.send({ content: `You're up vs ${p2.username}! Click below to check in:`, components: [row1] });
  } catch (e) {
    console.log(`❌ Could not DM ${p1.username}:`, e);
  }

  try {
    const user2 = await client.users.fetch(p2.id);
    await user2.send({ content: `You're up vs ${p1.username}! Click below to check in:`, components: [row2] });
  } catch (e) {
    console.log(`❌ Could not DM ${p2.username}:`, e);
  }

  checkIns.set(`${p1.id}-${p2.id}`, { p1: false, p2: false, match, startTime: Date.now(), channelId: channel.id });
  setTimeout(() => handleCheckInTimeout(p1, p2, match, channel, bracket), 5 * 60 * 1000);
}

async function handleCheckInTimeout(p1, p2, match, channel, bracket) {
  const id = `${p1.id}-${p2.id}`;
  const result = checkIns.get(id);
  if (!result) return;
  if (result.p1 && result.p2) return;
  if (result.p1) return resolveMatch(p1, match, channel, bracket);
  if (result.p2) return resolveMatch(p2, match, channel, bracket);
  checkIns.delete(id);
  const ch = await client.channels.fetch(channel.id);
  ch.send(`⚠️ Match between ${p1.username} and ${p2.username} skipped due to no check-in.`);
  bracket.currentMatchIndex++;
  runNextMatch(bracket, ch);
}

function resolveMatch(winner, match, channel, bracket) {
  const loser = match[0].id === winner.id ? match[1] : match[0];
  match.winner = winner;
  match.loser = loser;
  bracket.results.push({ round: bracket.round, match, winner, loser });
  console.log(`🏁 Round ${bracket.round} | ${winner.username} defeated ${loser.username}`);
  channel.send(`✅ ${winner.username} wins the match against ${loser.username}`);
  bracket.currentMatchIndex++;
  runNextMatch(bracket, channel);
}

function runNextMatch(bracket, channel) {
  if (bracket.currentMatchIndex >= bracket.matchups.length) {
    const unresolved = bracket.matchups.find(m => !m.winner);

    if (unresolved) {
      channel.send(`⏳ Waiting for a match between ${unresolved.player1.username} and ${unresolved.player2.username || 'BYE'} to finish.`);
      return;
    }

    const winners = bracket.matchups.map(m => m.winner).filter(Boolean);
    if (winners.length === 1) {
      const finalWinner = winners[0];
      channel.send(`🏆 The tournament is over! Winner: **${finalWinner.username}**`);
      return;
    }

    if (bracket.format === 'double_elim') {
      if (!bracket.losersBracket) bracket.losersBracket = [];
      bracket.losersBracket.push(...bracket.matchups.filter(m => m.winner !== m[0] && m.winner !== m[1]));
    }

    bracket.matchups = generateMatchups(winners);
    bracket.round++;
    bracket.currentMatchIndex = 0;
    channel.send(`📢 Starting Round ${bracket.round}!`);
    runNextMatch(bracket, channel);
    return;
  }

  // Otherwise, continue with the next match
  const match = bracket.matchups[bracket.currentMatchIndex];
  if (!match.winner) {
    startCheckIn(match, channel, bracket);
  }
}


client.on('interactionCreate', async interaction => {
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
        await interaction.reply('🎮 Tournament starting!');
        runNextMatch(bracket, interaction.channel);
        break;
      }
      case 'say': {
        const content = interaction.options.getString('message');
        if (!content) {
          await interaction.reply({ content: '❌ You need to tell me what to say!', ephemeral: true });
          break;
        }
        await interaction.reply({ content });
        break;
      }
      case 'about': {
        await interaction.reply("I am a tournament bot created by `@qmqz2`. I am used to smoothly and easily host tournaments for any game without the hassle of doing a million things. I'm in early development so if you discover any bugs or have any suggestions, please DM me: `@qmqz2`! Or post your ideas in the `bot-suggestions` forum in my support server. Type /support for a link to the support server ");
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
      `/join – Join the current tournament in this channel. (Can only be used in the same channel where /startbracket was run)\n` +
      `/leave – Leave the current tournament before it starts. (Can only be used in the same channel where /startbracket was run. Leaving during active tourney marks your username as “BYE”)\n` +
      `/start – Start the tournament when players are ready.\n` +
      `/say – Make the bot say a custom message in the channel.\n` +
      `/about – Get info about the bot and its creator.\n` +
      `/ping – Check the bot's status and latency.\n` +
      `/logwin – (Admin only) Manually log a win by selecting winner and loser.\n` +
      `/support – Get a link to the support server.`
    )
    .setFooter({ text: 'Tournament Bot • Use slash commands for quick access' })
    .setTimestamp();

  interaction.reply({ embeds: [embed], ephemeral: true });
  break;
}

      case 'support': {
        await interaction.reply("Our support server link is:" + " https://discord.gg/f2rMKaQvP9")
        break;
      }
    case 'logwin': {
  const winner = interaction.options.getUser('winner');
  const loser = interaction.options.getUser('loser');
  const bracket = brackets.get(interaction.channel.id);
  if (!bracket) return interaction.reply({ content: '❌ No active bracket in this channel.', ephemeral: true });

  const match = bracket.matchups[bracket.currentMatchIndex];
  if (!match) return interaction.reply({ content: '❌ No active match to log.', ephemeral: true });

  const winnerPlayer = match.find(p => p.id === winner.id);
  const loserPlayer = match.find(p => p.id === loser.id);
  if (!winnerPlayer || !loserPlayer) {
    return interaction.reply({ content: '❌ Those users are not in the current match.', ephemeral: true });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm_win').setLabel('✅ Confirm Win').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('decline_win').setLabel('❌ Decline').setStyle(ButtonStyle.Danger)
  );

  await interaction.reply({
    content: `🏁 ${winner.username} claims a win against ${loser.username}.\nBoth players must confirm below.`,
    components: [row]
  });

  const filter = i => [winner.id, loser.id].includes(i.user.id) && ['confirm_win', 'decline_win'].includes(i.customId);
  const confirmed = new Set();

  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60_000 });

  collector.on('collect', async i => {
    if (i.customId === 'decline_win') {
      collector.stop('declined');
      return i.reply({ content: '❌ Match report was declined.', ephemeral: true });
    }

    confirmed.add(i.user.id);
    await i.reply({ content: '✅ Confirmation received.', ephemeral: true });

    if (confirmed.has(winner.id) && confirmed.has(loser.id)) {
      resolveMatch(winnerPlayer, match, interaction.channel, bracket);
      collector.stop('confirmed');
      await interaction.followUp({ content: `✅ Both players confirmed: ${winner.username} defeated ${loser.username}.` });
    }
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      interaction.followUp({ content: '⌛ Match confirmation timed out. Please try again.' });
    }
  });

  break;
}


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
            console.error('❌ Failed to handle check-in interaction:', err);
            await interaction.reply({ content: '❌ An error occurred while checking in.', ephemeral: true });
          }
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn('⚠️ Check-in attempted but match data not found for:', checkinId);
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
        results: []
      };
      brackets.set(interaction.channel.id, bracket);
      await interaction.update({ content: 'Bracket created! Players can now /join.', components: [] });
    }
  }
});

const commands = [
  new SlashCommandBuilder().setName('startbracket').setDescription('Start a new tournament bracket.'),
  new SlashCommandBuilder().setName('join').setDescription('Join the current tournament.'),
  new SlashCommandBuilder().setName('leave').setDescription('Leave the current tournament.'),
  new SlashCommandBuilder().setName('start').setDescription('Begin the tournament.'),
  new SlashCommandBuilder().setName('say').setDescription('Make me say something!').addStringOption(option => option.setName('message') .setDescription('What should I say?').setRequired(true)),
  new SlashCommandBuilder().setName('about').setDescription('Learn about me!'),
  new SlashCommandBuilder().setName('ping').setDescription('Check if I am alive!'),
  new SlashCommandBuilder().setName('logwin').setDescription('Admin only: Log a match result manually.')
    .addUserOption(option => option.setName('winner').setDescription('Match winner').setRequired(true))
    .addUserOption(option => option.setName('loser').setDescription('Match loser').setRequired(true)),
  new SlashCommandBuilder().setName('support').setDescription('A link to the support server'),
  new SlashCommandBuilder().setName('commands').setDescription('A list of what I can do!')
]
.map(cmd => cmd.toJSON());

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


client.login(TOKEN2);

