# Stock Trading Discord Bot

A Discord bot for tracking and sharing stock option trades within your server.

## Features

- Enter stock trade information via a modal form
- Track open and closed positions
- Record sell transactions (partial or full)
- Alert specific roles when trades are made
- View detailed logs of your trades
- AI-powered trade analysis using OpenAI

## Setup

### Prerequisites

- Node.js v16+ (automatically handled by Docker)
- Discord Bot Token (see below)
- CouchDB (automatically handled by Docker)
- OpenAI API Key

### Discord Bot Creation

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name your bot
3. Go to the "Bot" tab and click "Add Bot"
4. Under the "Privileged Gateway Intents" section, enable:
   - SERVER MEMBERS
   - MESSAGE CONTENT
5. Copy the bot token (will be used in the `.env` file)
6. Go to the "OAuth2" tab
7. Under "URL Generator", select "bot" and "applications.commands" scopes
8. Under "Bot Permissions", select:
   - "Send Messages"
   - "Embed Links"
   - "Use Slash Commands"
9. Copy the generated URL and open it in a browser to add the bot to your server

### Environment Configuration

Create a `.env` file in the root directory with the following content:

```
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_bot_client_id
GUILD_ID=your_server_id
TRADE_CHANNEL_ID=your_trades_channel_id
ALERT_ROLE_ID=your_role_id_to_alert

# CouchDB Configuration
COUCHDB_URL=http://couchdb:5984
COUCHDB_USER=admin
COUCHDB_PASSWORD=password

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### Deployment

Build and start the application using Docker Compose:

```bash
docker-compose up --build
```

Once the bot is running, you need to register the slash commands:

```bash
# In a separate terminal
docker-compose exec app npm run dev -- src/deploy-commands.ts
```

## Usage

The bot provides the following slash commands:

- `/trade add` - Add a new trade (opens a modal to enter details)
- `/trade sell` - Record a sell for an existing trade (supports partial sells)
- `/trade list` - List your open trades

## Development

To build the TypeScript code:

```bash
npm run build
```

To run in development mode:

```bash
npm run dev
``` 