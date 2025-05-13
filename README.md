# Stock Trading Discord Bot

A Discord bot for tracking and sharing stock option trades within your server. The bot helps maintain transparency in trading activities and provides tools for portfolio tracking.

## Features

### Trade Management
- Enter stock trade information via an intuitive modal form
- Track open and closed positions in real-time
- Record sell transactions (partial or full sells supported)
- Automatic position status updates
- Trade notes and comments support

### Alerts and Notifications
- Alert specific roles when trades are made
- Customizable trade alerts with detailed information
- Real-time position updates

### Portfolio Tracking
- View detailed logs of all trades
- Export trade history to CSV with calculated totals
- Track running P&L (Profit/Loss)
- View open positions summary

### Analysis Tools
- AI-powered trade analysis using OpenAI
- Daily trading summaries
- Historical trade data access

## Installation

### Prerequisites

- Node.js v16+ (automatically handled by Docker)
- Docker and Docker Compose
- Discord Bot Token
- CouchDB (automatically handled by Docker)
- OpenAI API Key

### Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.19.3",
    "dotenv": "^16.3.1",
    "nano": "^10.1.2",
    "openai": "^4.98.0",
    "typescript": "^5.3.3"
  },
  "devDependencies": {
    "@types/nano": "^7.0.0",
    "@types/node": "^20.10.4",
    "ts-node": "^10.9.1"
  }
}
```

### Discord Bot Creation

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name your bot
3. Go to the "Bot" tab and click "Add Bot"
4. Under the "Privileged Gateway Intents" section, enable:
   - SERVER MEMBERS
   - MESSAGE CONTENT
5. Copy the bot token (will be used in the `.env` file)
6. Go to the "OAuth2" tab
7. Under "URL Generator", select:
   - Scopes: "bot" and "applications.commands"
   - Bot Permissions:
     - "Send Messages"
     - "Embed Links"
     - "Use Slash Commands"
     - "Attach Files" (for CSV exports)
8. Copy the generated URL and open it in a browser to add the bot to your server

### Environment Configuration

Create a `.env` file in the root directory with the following content:

```env
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

### Installation Methods

#### Using Docker (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd sevenpings
```

2. Build and start the application:
```bash
docker-compose up --build
```

3. Register slash commands:
```bash
docker-compose exec app npm run dev -- src/deploy-commands.ts
```

#### Manual Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sevenpings
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npm run build
```

4. Start the bot:
```bash
npm start
```

## Usage

### Available Commands

- `/trade add` - Add a new trade
  - Opens a modal form to enter trade details
  - Supports stocks and options
  - Includes fields for price, quantity, and notes

- `/trade sell` - Record a sell transaction
  - Supports partial sells
  - Automatically updates position status
  - Calculates profit/loss

- `/trade list` - View open positions
  - Shows current open trades
  - Displays average cost basis
  - Includes position details

### Daily Summaries

The bot automatically generates daily trading summaries at 4:00 PM EST, including:
- Day's trading activity
- Open positions
- Realized P&L
- Notable trades

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building the Project

```bash
npm run build
```

### Deploying New Commands

```bash
npm run deploy-commands
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

ISC License 