require('dotenv').config();
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Web server running'));

require('./tourneyBot'); // require the tourney bot file to be run also


const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});
require('dotenv').config();
const TOKEN = process.env.TOKEN;
const POINTS_FILE = 'points.json';
let points = {};

if (fs.existsSync(POINTS_FILE)) {
  points = JSON.parse(fs.readFileSync(POINTS_FILE));
}

function savePoints() {
  fs.writeFileSync(POINTS_FILE, JSON.stringify(points, null, 2));
}

function getPoints(userId) {
  return points[userId] || 0;
}

function addPoints(userId, amount) {
  if (!points[userId]) points[userId] = 0;
  points[userId] += amount;
  if (points[userId] < 0) points[userId] = 0;
  savePoints();
}

function getTier(points) {
  return Math.min(10, Math.floor(points / 100) + 1);
}

function getPointValues(tier) {
  switch (tier) {
    case 1: return { win: 40, loss: 20 };
    case 2: return { win: 36, loss: 22 };
    case 3: return { win: 32, loss: 24 };
    case 4: return { win: 30, loss: 25 };
    case 5: return { win: 28, loss: 26 };
    case 6: return { win: 26, loss: 28 };
    case 7: return { win: 24, loss: 28 };
    case 8: return { win: 22, loss: 28 };
    case 9: return { win: 20, loss: 28 };
    case 10: return { win: 20, loss: 30 };
    default: return { win: 0, loss: 0 };
  }
}

function isWithinTierRange(t1, t2) {
  return Math.abs(t1 - t2) <= 2;
}

// Store match history
const matchHistory = new Map();

function addMatchToHistory(playerId, opponentId, result, pointsChange) {
  if (!matchHistory.has(playerId)) {
    matchHistory.set(playerId, []);
  }
  const matches = matchHistory.get(playerId);
  matches.unshift({
    timestamp: Date.now(),
    opponent: opponentId,
    result,
    pointsChange
  });
  // Keep only last 10 matches
  if (matches.length > 10) matches.pop();
}

async function updateUserTierRole(member, oldTier, newTier) {
  try {
    if (!member.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      console.error('Bot missing Manage Roles permission!');
      return false;
    }

    if (oldTier === newTier) return true;

    // Remove all existing tier roles
    const roles = member.guild.roles.cache;
    for (let i = 1; i <= 10; i++) {
      const roleName = `Tier ${i}`;
      const role = roles.find(r => r.name === roleName);
      if (role && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
      }
    }

    // Add new tier role
    const newRoleName = `Tier ${newTier}`;
    const newRole = roles.find(r => r.name === newRoleName);
    if (!newRole) {
      console.error(`Role "${newRoleName}" not found!`);
      return false;
    }

    if (newRole.position >= member.guild.members.me.roles.highest.position) {
      console.error('Bot role must be higher than tier roles!');
      return false;
    }

    await member.roles.add(newRole);
    return true;
  } catch (error) {
    console.error('Error updating roles:', error);
    return false;
  }
}

function getPlayerStats(playerId) {
  const matches = matchHistory.get(playerId) || [];
  const wins = matches.filter(m => m.result === 'win').length;
  const losses = matches.filter(m => m.result === 'loss').length;
  const winRate = matches.length > 0 ? (wins / matches.length * 100).toFixed(1) : 0;
  const totalPoints = getPoints(playerId);
  const tier = getTier(totalPoints);

  return {
    matches: matches.length,
    wins,
    losses,
    winRate,
    totalPoints,
    tier
  };
}

client.once('ready', () => {
  console.log(`Bear Credits Bot is online as ${client.user.tag}`);
  client.user.setActivity('SSBU Rankings', { type: 'Watching' });
});

client.on('messageCreate', async message => {
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  const mention = message.mentions.users.first();

  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  const senderId = message.author.id;
  const senderPoints = getPoints(senderId);
  const senderTier = getTier(senderPoints);

  switch (command) {
    case '!win':
    case '!loss':
      if (!isAdmin) return message.reply('Only admins can update match results.');
      if (!mention) return message.reply('Mention a user to record the match result.');
      if (mention.id === message.author.id) return message.reply('You can’t record a match for yourself.');

      const targetId = mention.id;
      const oldPoints = getPoints(targetId);
      const oldTier = getTier(oldPoints);
      const targetTier = getTier(oldPoints);

      if (!isWithinTierRange(senderTier, targetTier)) {
        return message.reply(`Tier mismatch! You are Tier ${senderTier}, and ${mention.username} is Tier ${targetTier}. Matches must be within 2 tiers.`);
      }

      const { win, loss } = getPointValues(targetTier); // Use targetTier instead of senderTier

      if (command === '!win') {
        addPoints(targetId, win);
        addMatchToHistory(targetId, message.author.id, 'win', win);
        message.channel.send(`${mention.username} won and gained ${win} points! Total: ${getPoints(targetId)} (Tier ${getTier(getPoints(targetId))})`);
      } else {
        addPoints(targetId, -loss);
        addMatchToHistory(targetId, message.author.id, 'loss', -loss);
        message.channel.send(`${mention.username} lost and lost ${loss} points. Total: ${getPoints(targetId)} (Tier ${getTier(getPoints(targetId))})`);
      }

      const newPoints = getPoints(targetId);
      const newTier = getTier(newPoints);

      if (newTier > oldTier) {
        message.channel.send(`**Congrats ${mention.username}, you ranked UP to Tier ${newTier}!**`);
      } else if (newTier < oldTier) {
        message.channel.send(`**${mention.username} has dropped to Tier ${newTier}.** Keep grinding!`);
      }

      updateUserTierRole(message.guild.members.cache.get(targetId), oldTier, newTier);
      break;

    case '!tier':
      const rankUser = mention || message.author;
      const rankPoints = getPoints(rankUser.id);
      const rankTier = getTier(rankPoints);
      message.channel.send(`${rankUser.username} has ${rankPoints} points and is in Tier ${rankTier}.`);
      break;

    case '!tierlist':
      message.channel.send(`**Bear Credits Tier List**

Tier 1: 0–99 — Win: 40, Loss: 20  
Tier 2: 100–199 — Win: 36, Loss: 22  
Tier 3: 200–299 — Win: 32, Loss: 24  
Tier 4: 300–399 — Win: 30, Loss: 25  
Tier 5: 400–499 — Win: 28, Loss: 26  
Tier 6: 500–599 — Win: 26, Loss: 28  
Tier 7: 600–699 — Win: 24, Loss: 28  
Tier 8: 700–799 — Win: 22, Loss: 28  
Tier 9: 800–899 — Win: 20, Loss: 28  
Tier 10: 900+ — Win: 20, Loss: 30`);
      break;

    case '!resetpoints':
      if (!isAdmin) return message.reply('Only admins can reset points.');
      points = {};
      savePoints();
      message.channel.send('All Bear Credit points have been reset.');
      break;

    case '!commands':
      message.channel.send(`==Bear Credits Bot Commands==

!win @user — Add a win (Admin only)\n 
!loss @user — Add a loss (Admin only)\n 
!tier [@user] — Show points and tier\n  
!tierlist — Show all tiers and point values \n 
!resetpoints — Reset everyone’s points (Admin only)\n
!pingbear - Check if bot is alive\n
!id - Get the ID of a user (For adding to points.json dont worry about this)\n
!leaderboard - Show the top 10 users\n
!commands - Shows this message\n
!stats [@user] - Show detailed player statistics\n
!history [@user] - Show recent match history\n
!version - Shows the version of the bot\n
!storeset - Store a set of matches that an admin missed.\n\n format:\n\n !storeset @player1 score1 - @player2 score2\n
!storedsets - Shows all stored sets\n
!flipcoin - Flip a coin\n
!history [@user] - Shows the match history of a user\n
!stats [@user] - Shows the stats of a user\n
!hug - Hug someone\n
!glaze - Learn about my developer
!glaze2 - Learn about the server owner\n
!say - Make me say something!\n
!aboutme - Learn about me!\n

**Rules:**  
- Tiers go in 100-point steps  
- You may challenge users within 2 tiers  
- Point values scale with tier`);;
      break;

    case '!pingbear':
      message.reply('Pong!' + " I'm alive! How can I help you?");
      break;

    case '!id':
      message.reply('The ID of this user is: ' + mention.id)
      break;

    case '!leaderboard':
      const sortedPoints = Object.entries(points).sort((a, b) => b[1] - a[1]);
      const top10 = sortedPoints.slice(0, 10);
      let leaderboardText = "**Bear Credits Leaderboard**\n\n";

      // Fetch all users first
      for (const entry of top10) {
        if (!client.users.cache.has(entry[0])) {
          await client.users.fetch(entry[0]).catch(() => {});
        }
      }

      for (let i = 0; i < top10.length; i++) {
        try {
          const member = await message.guild.members.fetch(top10[i][0]).catch(() => null);
          const displayName = member ? member.displayName : `User-${top10[i][0]}`;
          leaderboardText += `${i + 1}. ${displayName} - ${top10[i][1]} points (Tier ${getTier(top10[i][1])})\n`;
        } catch {
          leaderboardText += `${i + 1}. User-${top10[i][0]} - ${top10[i][1]} points (Tier ${getTier(top10[i][1])})\n`;
        }
      }
      message.channel.send(leaderboardText);
      break;

    case '!version':
      const versionData = JSON.parse(fs.readFileSync('version.json', 'utf8'));
      message.reply(`Bear Credits Bot Version ${versionData.version}\nMy developer: @qmqz2`);
      break;

    case '!update':
      if (!message.member.roles.cache.some(role => role.name === "BearDev")) {
        return message.reply('Hey! Only my developer can update my version.');
      }
      const currentVersion = JSON.parse(fs.readFileSync('version.json', 'utf8'));
      const [major, minor, patch] = currentVersion.version.split('.').map(Number);
      currentVersion.version = `${major}.${minor}.${patch + 1}`;
      fs.writeFileSync('version.json', JSON.stringify(currentVersion, null, 2));
      message.reply(`Version updated to ${currentVersion.version}`);
      break;

    case '!storeset':
      if (args.length < 4) {
        message.reply('Usage: !storeset @player1 score1 - @player2 score2');
        break;
      }

      const players = message.mentions.users;
      if (players.size !== 2) {
        message.reply('Please mention exactly 2 players.');
        break;
      }

      const matchData = `${message.author.username}: ${args.slice(1).join(' ')}\n`;
      fs.appendFileSync('storedSets.txt', matchData);
      message.reply('Match set has been stored!');
      break;

    case '!storedsets':
      try {
        const storedSets = fs.readFileSync('storedSets.txt', 'utf8');
        if (!storedSets.trim()) {
          message.reply('No sets have been stored yet.');
          break;
        }

        // Pre-fetch all user info from mentions in the stored sets
        const userPattern = /<@(\d+)>/g;
        const userIds = [...new Set([...storedSets.matchAll(userPattern)].map(match => match[1]))];

        for (const userId of userIds) {
          if (!client.users.cache.has(userId)) {
            await client.users.fetch(userId).catch(() => {});
          }
        }

        // Replace mentions with nicknames
        let formattedSets = storedSets;
        for (const userId of userIds) {
          const member = await message.guild.members.fetch(userId).catch(() => null);
          const displayName = member ? member.displayName : `Unknown-${userId}`;
          formattedSets = formattedSets.replace(new RegExp(`<@${userId}>`, 'g'), displayName);
        }

        message.reply('**Stored Sets:**\n' + formattedSets);
      } catch (error) {
        message.reply('Error reading stored sets.');
        console.error(error);
      }
      break;

    case '!stats':
      const statsUser = mention || message.author;
      const stats = getPlayerStats(statsUser.id);
      message.channel.send(`**Stats for ${statsUser.username}**
Tier: ${stats.tier}
Total Points: ${stats.totalPoints}
Matches Played: ${stats.matches}
Wins: ${stats.wins}
Losses: ${stats.losses}
Win Rate: ${stats.winRate}%`);
      break;

    
      case '!history':
      const historyUser = mention || message.author;
      const matches = matchHistory.get(historyUser.id) || []; // Get the match history from the map

      if (matches.length === 0) {
        message.channel.send(`${historyUser.username} has no match history.`);
      } else {
        let historyText = `**Match History for ${historyUser.username}**\n\n`;

        for (const match of matches) {
          const opponent = await client.users.fetch(match.opponent);
          const timeAgo = Math.floor((Date.now() - match.timestamp) / 60000);
          historyText += `${timeAgo}m ago: ${match.result.toUpperCase()} vs ${opponent.username} (${match.pointsChange > 0 ? '+' : ''}${match.pointsChange} points)\n`;
        }

        message.channel.send(historyText);
      }
      break;
    case '!syncroles':
      if (!isAdmin) return message.reply('Only admins can sync roles.');
      let success = 0;
      let failed = 0;
      message.channel.send('Starting role sync...');

      for (const [userId, userPoints] of Object.entries(points)) {
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (member) {
          const tier = getTier(userPoints);
          const result = await updateUserTierRole(member, 0, tier);
          if (result) success++; else failed++;
        }
      }

      message.channel.send(`Role sync complete! Success: ${success}, Failed: ${failed}`);
      break;

      case '!flipcoin':
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
      message.channel.send("It's " + result + '!')
        break;

    case '!glaze':
      message.reply("qmqz2 aka my developer is the smartest most amazing most perfect guy I've ever met. He is my creator and I love him.")
      break;

    case '!glaze2':
      message.reply("BearHugs is lrly the most amazing guy ever. I wouldn't exist if he never created this server. He is the best.")
      break;

      case '!hug':
      if (!mention) {
        message.reply("Please mention someone to hug! 🤗");
        break;
      }
      if (mention.id === 1370796620555227176) {
        message.reply("I'm a bot, I can't hug you! But I love you anyway! ❤️");
      }
      message.reply(`${message.author.displayName} gave a hug to ${mention.displayName}! ❤️`);
      break;

      case '!say':
      const sayContent = args.slice(1).join(' '); // Skip the command itself
      if (!sayContent) {
        message.reply('You need to tell me what to say!');
        break;
      }

      await message.delete(); // Delete the user's original message
      message.channel.send(sayContent); // Bot sends the message
      break;

    case '!aboutme':
     message.reply('I am a bot created by @qmqz2. I am used to keep track of points in the BearHugs server. I am still in development, so if you have any ideas , go to the `#bot-suggestions` channel and tell me them!');
     break;
      
    default:
      message.reply('Unknown command. Try `!commands` to see what I can do.');
  }
});
//hi :3
client.login(TOKEN);
