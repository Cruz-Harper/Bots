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

    case 'release': {
  const fs = require('fs');
  const userId = interaction.user.id;

  const puffs = fs.existsSync('puffs.json') ? JSON.parse(fs.readFileSync('puffs.json')) : {};

  if (!puffs[userId]) {
    await interaction.reply("You don't have a Jigglypuff to release.");
    return;
  }

  const releasedName = puffs[userId].name;
  delete puffs[userId];

  fs.writeFileSync('puffs.json', JSON.stringify(puffs, null, 2));
  await interaction.reply(`You released **${releasedName}** into the wild. 🕊️`);
  break;
}

   case 'adopt': {
  const fs = require('fs');
  const name = interaction.options.getString('name');
  const userId = interaction.user.id;

  const attributes = ['Fighter', 'Lazy', 'Energetic', 'Calm', 'Playful', 'Serious', 'Curious'];
  const attribute = attributes[Math.floor(Math.random() * attributes.length)];
  const isShiny = Math.random() < 0.05; // 5% chance to be shiny

  let puffs = fs.existsSync('puffs.json') ? JSON.parse(fs.readFileSync('puffs.json')) : {};

  if (puffs[userId]) {
    await interaction.reply("You already adopted a Jigglypuff! Use `/release` to let it go first.");
    return;
  }

  const newPuff = {
    name,
    level: 1,
    happiness: 50,
    attribute,
    isShiny,
    isSleeping: false
  };

  puffs[userId] = newPuff;
  fs.writeFileSync('puffs.json', JSON.stringify(puffs, null, 2));

  const shinyMsg = isShiny ? " ✨ It's SHINY!" : "";
  await interaction.reply(`You adopted **${name}**, a ${attribute} Jigglypuff!${shinyMsg}`);
  break;
}

      case 'mypuff': {
  const userId = interaction.user.id;
  const puffs = JSON.parse(fs.readFileSync('puffs.json', 'utf8'));
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
    .setDescription('Release your current Jigglypuff')

  new SlashCommandBuilder()
    .setName('mypuff')
    .setDescription('View your adopted Jigglypuff and its stats')
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

