import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './services/database';
import Scheduler from './services/scheduler';
import { generateDailySummary } from './services/dailySummary';

// Load environment variables
config();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Extend client for commands
interface BotClient extends Client {
  commands: Collection<string, any>;
}

(client as BotClient).commands = new Collection();

// Load command files
const commandsPath = path.join(__dirname, 'commands');
// When running with ts-node, look for .ts files, otherwise look for .js files
const isTypeScript = process.argv[0].includes('ts-node');
const commandFiles = fs.readdirSync(commandsPath).filter(file => 
  isTypeScript ? file.endsWith('.ts') : file.endsWith('.js')
);

console.log(`Looking for ${isTypeScript ? '.ts' : '.js'} files in ${commandsPath}`);

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      (client as BotClient).commands.set(command.data.name, command);
      console.log(`Loaded command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] Command at ${filePath} is missing required properties.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
  }
}

// Connect to CouchDB
initDatabase(process.env.COUCHDB_URL || 'http://couchdb:5984')
  .then(() => console.log('Connected to CouchDB'))
  .catch(err => console.error('CouchDB connection error:', err));

// Initialize scheduler
let scheduler: Scheduler;

// Event handler for when the client is ready
client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log('Registered commands:', Array.from((client as BotClient).commands.keys()));
  
  // Initialize and start the scheduler
  scheduler = new Scheduler(client);
  
  // Schedule the daily summary to run at 4:00 PM Eastern Time
  // Convert from EST to UTC (EST is UTC-5 or UTC-4 during daylight saving)
  // Using 21:00 UTC which is 4:00 PM EST (or 5:00 PM EDT)
  scheduler.scheduleDaily('dailySummary', 21, 0, async () => {
    console.log('Generating daily trading summary...');
    await generateDailySummary(client);
  });
  
  scheduler.start();
});

// Event handler for interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand() && !interaction.isModalSubmit() && !interaction.isButton() && !interaction.isStringSelectMenu()) {
    console.log('Received non-command interaction:', interaction.type);
    return;
  }

  try {
    if (interaction.isCommand()) {
      console.log(`Received command: ${interaction.commandName}`);
      const command = (client as BotClient).commands.get(interaction.commandName);
      
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ content: 'This command is not properly registered.', ephemeral: true });
        return;
      }
      
      await command.execute(interaction);
    }
    
    if (interaction.isModalSubmit() || interaction.isButton() || interaction.isStringSelectMenu()) {
      const commandName = interaction.customId.split('_')[0];
      console.log(`Received ${interaction.isModalSubmit() ? 'modal' : interaction.isButton() ? 'button' : 'select menu'} interaction for command: ${commandName}`);
      const command = (client as BotClient).commands.get(commandName);
      
      if (!command) {
        console.error(`No command matching ${commandName} was found for interaction.`);
        await interaction.reply({ content: 'This interaction is not properly handled.', ephemeral: true });
        return;
      }
      
      await command.handleInteraction(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    const errorMessage = 'There was an error executing this command!';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Bot is shutting down...');
  
  // Stop the scheduler
  if (scheduler) {
    scheduler.stop();
  }
  
  client.destroy();
  console.log('Bot has been shut down.');
  process.exit(0);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Successfully logged in to Discord'))
  .catch(error => console.error('Failed to log in to Discord:', error)); 