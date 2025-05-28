const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Create the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Constants from .env
const TOKEN3 = process.env.TOKEN3;
const CLIENT_ID_2 = process.env.CLIENT_ID_2;

// Helper functions
const ATTRIBUTES = ['Fighter', 'Lazy', 'Energetic', 'Calm', 'Playful', 'Serious', 'Curious'];
const getRandomAttribute = () => ATTRIBUTES[Math.floor(Math.random() * ATTRIBUTES.length)];
const getRandomShiny = () => Math.random() < 0.05;

function loadPuffs() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'puffs.json'), 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function savePuffs(data) {
  fs.writeFileSync(path.join(__dirname, 'puffs.json'), JSON.stringify(data, null, 2));
}

// When bot is ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Command handling
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  switch (interaction.commandName) {
    case 'ping': {
      await interaction.reply(`Puff bot is working! 💤 Ping: ${client.ws.ping}ms`);
      break;
    }

    case 'about': {
      await interaction.reply("Train your puff and grow your bond! I being developed by user @qmqz2 and I still have LOTS of problems and bugs so if you discover any, please dm me!");
      break;
    }

    case 'release': {
      const puffs = loadPuffs();

      if (!puffs[userId]) {
        await interaction.reply("You don't have a Jigglypuff to release.");
        return;
      }

      const releasedName = puffs[userId].name;
      delete puffs[userId];

      savePuffs(puffs);
      await interaction.reply(`You released **${releasedName}** into the wild.\nhttps://tenor.com/bw7jP.gif`);
      break;
    }

    case 'adopt': {
      const name = interaction.options.getString('name');

      const puffs = loadPuffs();

      if (puffs[userId]) {
        await interaction.reply("You already adopted a Jigglypuff! Use `/release` to let it go first.");
        return;
      }

      const attribute = getRandomAttribute();

      // 💫 Shiny logic: 50% for special user, 0.5% for others
      const isSpecialUser = userId === '1279794540253020264';
      const isShiny = Math.random() < (isSpecialUser ? 0.5 : 0.005);

      const newPuff = {
        name,
        level: 1,
        happiness: 50,
        attribute,
        isShiny,
        isSleeping: false
      };

      puffs[userId] = newPuff;
      savePuffs(puffs);

      const shinyMsg = isShiny ? " ✨ It's SHINY!" : "";
      await interaction.reply(`You adopted **${name}**, a ${attribute} Jigglypuff!${shinyMsg}`);
      break;
    }

    case 'mypuff': {
      const puffs = loadPuffs();
      const puff = puffs[userId];

      if (!puff) {
        await interaction.reply("You haven't adopted a Jigglypuff yet! Use `/adopt` to get started.");
      } else {
        await interaction.reply(
          `🎀 **${puff.name}** [Level ${puff.level}]` +
          `\n💖 Happiness: ${puff.happiness}` +
          `\n🌈 Attribute: ${puff.attribute}` +
          `\n✨ Shiny: ${puff.isShiny ? 'Yes' : 'No'}` +
          `\n😴 Sleeping: ${puff.isSleeping ? 'Yes' : 'No'}`
        );
      }
      break;
    }

    case 'train': {
      const puffs = loadPuffs();

      if (!puffs[userId]) {
        await interaction.reply("You don't have a Jigglypuff yet! Use `/adopt` to get one.");
        break;
      }

      const puff = puffs[userId];

      if (puff.isSleeping) {
        await interaction.reply(`${puff.name} is sleeping and cannot train right now.`);
        break;
      }

      puff.level += 1;

      switch (puff.attribute.toLowerCase()) {
        case "fighter":
          puff.happiness += 10;
          break;
        case "lazy":
          puff.happiness -= 5;
          break;
        case "energetic":
          puff.happiness += 15;
          break;
        case "calm":
          puff.happiness += 2;
          break;
        case "playful":
          puff.happiness += 8;
          break;
        case "serious":
          puff.happiness -= 3;
          break;
        case "curious":
          puff.happiness += 6;
          break;
        default:
          puff.happiness += 5;
      }

      // Clamp happiness between 0 and 100
      puff.happiness = Math.max(0, Math.min(puff.happiness, 100));

      savePuffs(puffs);

      await interaction.reply(`${puff.name} trained! Level is now ${puff.level} and happiness is ${puff.happiness}. 🎯`);
      break;
    }

    default:
      await interaction.reply({ content: 'Unknown command.', ephemeral: true });
  }
});

// Slash command registration
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Tests if the bot is working'),

  new SlashCommandBuilder()
    .setName('adopt')
    .setDescription('Adopt a new Jigglypuff and give it a name!')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('The name you want to give your Jigglypuff')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('release')
    .setDescription('Release your current Jigglypuff'),

  new SlashCommandBuilder()
    .setName('mypuff')
    .setDescription('View your adopted Jigglypuff and its stats'),

  new SlashCommandBuilder()
    .setName('train')
    .setDescription('Train your Jigglypuff to increase its level and happiness'),

  new SlashCommandBuilder()
    .setName('about')
    .setDescription('Learn about me and my genius creator!')
]
.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN3);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID_2),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// Login
client.login(TOKEN3);

