const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

// Create the Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Environment variables
const TOKEN3 = process.env.TOKEN3;
const CLIENT_ID_2 = process.env.CLIENT_ID_2;

// Ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Interaction handler with switch
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

const attributes = [
  "Fighter",
  "Lazy",
  "Energetic",
  "Calm",
  "Playful",
  "Serious",
  "Curious"
];




  
  switch (interaction.commandName) {
    case 'ping': {
      await interaction.reply('Puff bot is working! 💤' + "ping is: " + client.ws.ping);
      break;
    }
    default:
      await interaction.reply('Unknown command.');
  }
});

// Slash command definition
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Tests if the bot is working').toJSON()
];

// Register the slash command globally
const rest = new REST({ version: '10' }).setToken(TOKEN3);

(async () => {
  try {
    console.log('Registering slash command...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID_2),
      { body: commands }
    );
    console.log('Slash command registered.');
  } catch (error) {
    console.error('Error registering command:', error);
  }
})();

// Log in the bot
client.login(TOKEN3);

