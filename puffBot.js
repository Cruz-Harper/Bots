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
    case 'ping':
      await interaction.reply(`Puff bot is working! 💤 Ping: ${client.ws.ping}ms`);
      break;

    case 'adopt': {
      const name = interaction.options.getString('name');
      const allPuffs = loadPuffs();

      const newPuff = {
        name,
        level: 1,
        happiness: 50,
        attribute: getRandomAttribute(),
        isShiny: getRandomShiny(),
        isSleeping: false
      };

      if (!allPuffs[userId]) allPuffs[userId] = [];
      allPuffs[userId].push(newPuff);
      savePuffs(allPuffs);

      await interaction.reply(
        `🎉 You adopted **${name}**!\n` +
        `⭐ Attribute: **${newPuff.attribute}**\n` +
        `✨ Shiny: ${newPuff.isShiny ? 'Yes!' : 'No'}`
      );
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
    )
].map(command => command.toJSON());

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

