# Jeremiah Discord Bot

A feature-rich Discord bot with scoreboard functionality, leveling system, and quote management for The Long Dark survival game community.

## Features

- **Scoreboard System**: Submit and track survival scores with `/score` and view with `/scoreboard`
- **Leveling System**: XP-based user progression with message activity tracking  
- **Quote Management**: Store and retrieve quotes from different community members
- **Slash Commands**: Modern Discord slash command integration
- **Persistent Data**: JSON-based storage that persists between restarts

## Scoreboard Commands

- `/score` - Submit your survival score (day, hour, minute, difficulty)
- `/scoreboard` - Create/update the scoreboard in the current channel

## Setup

### Prerequisites

- Node.js 16.9.0 or higher
- A Discord application/bot token
- Discord server with appropriate permissions

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/YourUsername/Jeremiah.git
   cd Jeremiah
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up your bot files:
   - Copy `bot.github.js` to `bot.js`
   - Copy `tokens.example.txt` to `tokens.txt`
   - Copy `discloud.config.example` to `discloud.config` (for Discloud deployment)

4. Edit `tokens.txt` with your credentials:
   - Line 1: Your bot token
   - Line 2: Your client ID

5. The data directory will be created automatically when needed

### Getting Discord Bot Credentials

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token for line 1 of `tokens.txt`
5. Copy the Application ID from the "General Information" section for line 2 of `tokens.txt`

### Bot Permissions

The bot requires the following permissions:
- Send Messages
- Use Slash Commands
- Read Message History
- Embed Links
- Manage Messages (for scoreboard updates)

## Usage

### Starting the Bot

```bash
npm start
```

Or using the VS Code task:
- Open Command Palette (Ctrl+Shift+P)
- Run "Tasks: Run Task"
- Select "Start Bot"

### Using the Scoreboard

1. Use `/scoreboard` in any channel to create the initial scoreboard
2. Use `/score` to submit your survival time with difficulty level
3. The bot automatically updates the existing scoreboard message

## Difficulty Levels

- **Misery** - Hardest difficulty
- **Interloper** - Very hard
- **Stalker** - Hard
- **Voyageur** - Normal
- **Pilgrim** - Easy
- **Custom** - Custom game settings

## File Structure

```
├── bot.js                     # Main bot file
├── bot.github.js             # Identical copy for reference
├── tokens.txt                # Your bot credentials (ignored by git)  
├── tokens.example.txt        # Template for token file
├── data/
│   ├── scoreboard.json       # User scoreboard data (auto-created, ignored by git)
│   ├── levels.json          # User level/XP data (auto-created, ignored by git)
│   ├── scoreboard.example.json # Example scoreboard structure
│   └── levels.example.json  # Example levels structure
├── quotes/                  # Quote text files
│   ├── bandito_dorito.txt
│   ├── laika.txt
│   └── reliix.txt
└── package.json            # Project dependencies
```

## Security & Privacy

- **Data Privacy**: User data files (`data/*.json`) are excluded from version control
- **Token Security**: Bot credentials are in `tokens.txt` (ignored by Git)
- **GitHub Safety**: Only `tokens.example.txt` template is uploaded to GitHub
- **User Data Protection**: All sensitive user information remains local

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes (ensure no sensitive data is committed)
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
