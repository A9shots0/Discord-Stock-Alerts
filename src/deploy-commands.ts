import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
// When running with ts-node, look for .ts files, otherwise look for .js files
const isTypeScript = process.argv[0].includes('ts-node');
const commandFiles = fs.readdirSync(commandsPath).filter(file => 
  isTypeScript ? file.endsWith('.ts') : file.endsWith('.js')
);

console.log(`Looking for ${isTypeScript ? '.ts' : '.js'} files in ${commandsPath}`);

// Load commands
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
      console.log(`Loaded command: ${command.data.name}`);
    } else {
      console.log(`[WARNING] Command at ${filePath} is missing required properties.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
  }
}

// Deploy commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN || '');

(async () => {
  try {
    if (commands.length === 0) {
      console.error('[ERROR] No commands found to register!');
      process.exit(1);
    }

    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId || !guildId) {
      console.error('[ERROR] CLIENT_ID and/or GUILD_ID are missing from environment variables!');
      process.exit(1);
    }

    // The put method is used to fully refresh all commands with the current set
    const data = await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${Array.isArray(data) ? data.length : 0} application (/) commands.`);
  } catch (error) {
    console.error('[ERROR] Failed to deploy commands:', error);
    process.exit(1);
  }
})(); 