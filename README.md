# Jeremiah Discord Bot

A Discord bot with scoreboard functionality, leveling system, and quote management for The Long Dark Discord communities.

## Features

- **Scoreboard System**: Submit and track survival scores with `/score` and view with `/scoreboard`
- **Leveling System**: XP-based user progression with message activity tracking  
- **Persistent Data**: JSON-based storage that persists between restarts

## Scoreboard Commands

- `/score` - Submit your survival score (day, hour, minute, difficulty)
- `/scoreboard` - Create/update the scoreboard in the current channel

### Bot Permissions

The bot requires the following permissions:
- Send Messages
- Use Slash Commands
- Read Message History
- Embed Links
- Manage Messages

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