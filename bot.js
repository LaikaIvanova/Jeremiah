const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration - Read from tokens.txt file
let TOKEN, CLIENT_ID;
try {
    const tokensFile = path.join(__dirname, 'tokens.txt');
    const tokens = fs.readFileSync(tokensFile, 'utf8').trim().split('\n');
    TOKEN = tokens[0].trim();
    CLIENT_ID = tokens[1].trim();
} catch (error) {
    console.error('Error reading tokens.txt file:', error.message);
    console.error('Make sure tokens.txt exists with your bot token on line 1 and client ID on line 2');
    process.exit(1);
}

// Prevent duplicate levelboard operations
const levelboardOperations = new Set();

// Track processed interactions to prevent duplicates
const processedInteractions = new Set();

// Scoreboard data file
const SCOREBOARD_FILE = path.join(__dirname, 'data', 'scoreboard.json');
const LEVELS_FILE = path.join(__dirname, 'data', 'levels.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(path.dirname(SCOREBOARD_FILE))) {
    fs.mkdirSync(path.dirname(SCOREBOARD_FILE), { recursive: true });
}

// Scoreboard functions
function loadScoreboard() {
    if (!fs.existsSync(SCOREBOARD_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(SCOREBOARD_FILE, 'utf8'));
}

function saveScoreboard(data) {
    fs.writeFileSync(SCOREBOARD_FILE, JSON.stringify(data, null, 2));
}

function getServerScoreboard(guildId) {
    const allData = loadScoreboard();
    if (!allData[guildId]) {
        allData[guildId] = { entries: [], messageId: null, channelId: null };
    }
    return allData[guildId];
}

function saveServerScoreboard(guildId, serverData) {
    const allData = loadScoreboard();
    allData[guildId] = serverData;
    saveScoreboard(allData);
}

// Quote functions
function getRandomQuote(username) {
    const quotesPath = path.join(__dirname, 'quotes', `${username}.txt`);
    
    if (!fs.existsSync(quotesPath)) {
        return null; // User file doesn't exist
    }
    
    try {
        const quotesContent = fs.readFileSync(quotesPath, 'utf8');
        const quotes = quotesContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0); // Remove empty lines
        
        if (quotes.length === 0) {
            return null; // No quotes found
        }
        
        // Return a random quote
        const randomIndex = Math.floor(Math.random() * quotes.length);
        return quotes[randomIndex];
    } catch (error) {
        console.error(`Error reading quotes for ${username}:`, error);
        return null;
    }
}

// ARK Survival Ascended XP Requirements (levels 1-180)
const ARK_XP_TABLE = [
    0, 26, 54, 89, 131, 181, 239, 306, 381, 466, 560, 665, 780, 907, 1045, 1196, 1360, 1537, 1727, 1932,
    2151, 2385, 2635, 2901, 3184, 3485, 3805, 4144, 4504, 4885, 5288, 5714, 6163, 6637, 7136, 7661, 8213, 8793, 9402, 10041,
    10711, 11413, 12148, 12917, 13721, 14561, 15438, 16353, 17308, 18304, 19342, 20423, 21549, 22721, 23940, 25209, 26528, 27899, 29324, 30805,
    32342, 33938, 35595, 37314, 39097, 40946, 42863, 44849, 46907, 49039, 51246, 53530, 55893, 58337, 60864, 63476, 66175, 68963, 71842, 74815,
    77883, 81049, 84315, 87683, 91156, 94736, 98425, 102226, 106142, 110175, 114328, 118603, 123003, 127530, 132188, 136979, 141906, 146972, 152181, 157535,
    163038, 168693, 174503, 180471, 186600, 192894, 199356, 205990, 212799, 219787, 226958, 234315, 241863, 249606, 257548, 265693, 274045, 282609, 291389, 300390,
    309616, 319072, 328762, 338691, 348864, 359285, 369960, 380894, 392092, 403559, 415300, 427321, 439628, 452226, 465121, 478318, 491824, 505644, 519785, 534252,
    549052, 564191, 579675, 595512, 611707, 628267, 645200, 662512, 680211, 698304, 716798, 735701, 755021, 774766, 794944, 815563, 836631, 858158, 880152, 902622,
    925577, 949027, 972982, 997451, 1022444, 1047971, 1074043, 1100670, 1127863, 1155633, 1183991, 1212949, 1242518, 1272710, 1303537, 1335010, 1367142, 1399946, 1433434, 1467619,
    1502515, 1538135, 1574493, 1611603, 1649480, 1688138, 1727592, 1767857, 1808949, 1850883, 1893675, 1937341, 1981897, 2027359, 2073743, 2121066, 2169345, 2218597, 2268840, 2320092,
    2372375, 2425710, 2480118, 2535622, 2592244, 2650007, 2708934, 2769048, 2830374, 2892936, 2956759, 3021868, 3088289, 3156048, 3225172, 3295688, 3367623, 3441005, 3515862, 3592223
];

// Leveling functions
function loadLevels() {
    if (!fs.existsSync(LEVELS_FILE)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8'));
}

function saveLevels(data) {
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
}

function getServerLevels(guildId) {
    const allData = loadLevels();
    if (!allData[guildId]) {
        allData[guildId] = { 
            users: {}, 
            lastMessages: {},
            levelboardChannelId: null,
            levelboardMessageId: null
        };
    }
    return allData[guildId];
}

// Server Tags functions
function hasServerTag(user, guildId) {
    if (!user.primaryGuild) return false;
    
    return user.primaryGuild.identityEnabled && 
           user.primaryGuild.identityGuildId === guildId;
}

function getServerTagMultiplier(user, guildId) {
    // Give double XP for displaying server tag
    if (hasServerTag(user, guildId)) {
        return 2.0; // 100% bonus (double XP) for displaying server tag
    }
    return 1.0;
}

function saveServerLevels(guildId, serverData) {
    const allData = loadLevels();
    allData[guildId] = serverData;
    saveLevels(allData);
}

async function getLevelboardText(serverData, client) {
    if (!serverData.users || Object.keys(serverData.users).length === 0) {
        return '```\nLEVEL SCOREBOARD:\n\nNo users have gained XP yet!\nStart chatting to appear on the scoreboard.\n```';
    }
    
    // Sort users by level (then by XP as tiebreaker)
    const sortedUsers = Object.entries(serverData.users)
        .sort(([,a], [,b]) => {
            if (b.level !== a.level) return b.level - a.level; // Sort by level first
            return b.xp - a.xp; // Then by XP as tiebreaker
        })
        .slice(0, 15); // Top 15 for scoreboard
    
    // Calculate the maximum level and XP width for right alignment
    const maxLevel = Math.max(...sortedUsers.map(([,userData]) => userData.level));
    const levelWidth = maxLevel.toString().length;
    
    // Calculate maximum XP width (including commas)
    const maxXP = Math.max(...sortedUsers.map(([,userData]) => Math.floor(userData.xp)));
    const xpWidth = maxXP.toLocaleString().length;
    
    let scoreboard = '```\nLEVEL SCOREBOARD:\n';
    
    // User entries - fetch current usernames dynamically
    for (const [userId, userData] of sortedUsers) {
        const level = userData.level.toString().padStart(levelWidth, ' ');
        const xp = Math.floor(userData.xp).toLocaleString().padStart(xpWidth, ' '); // Right-align XP
        
        // Fetch current username from Discord
        let username = userData.username; // fallback to stored username
        try {
            const user = await client.users.fetch(userId);
            username = user.username;
        } catch (error) {
            // If user can't be fetched, use stored username as fallback
            console.log(`Could not fetch user ${userId}, using stored username: ${username}`);
        }
        
        scoreboard += `${level} | ${xp} XP | ${username}\n`;
    }
    
    scoreboard += '```';
    
    return scoreboard;
}

function getXPRequiredForLevel(level) {
    if (level <= 0) return 0;
    if (level >= ARK_XP_TABLE.length) return ARK_XP_TABLE[ARK_XP_TABLE.length - 1];
    return ARK_XP_TABLE[level - 1];
}

function getLevelFromXP(xp) {
    for (let i = ARK_XP_TABLE.length - 1; i >= 0; i--) {
        if (xp >= ARK_XP_TABLE[i]) {
            return i + 1;
        }
    }
    return 1;
}

function calculateXPGain(wordCount, lastMessageTime, messageCount, user, guildId) {
    // Base XP is 0.1 per word
    let xp = wordCount * 0.1;
    
    // Apply diminishing returns based on message frequency
    const now = Date.now();
    const timeSinceLastMessage = now - lastMessageTime;
    const fiveMinutes = 5 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;
    
    if (timeSinceLastMessage < fiveMinutes) {
        // Messages sent within 5 minutes get reduced XP
        // Each additional message reduces XP by 90%, but never below 0.1% (99.9% reduction max)
        const reductionFactor = Math.max(0.001, Math.pow(0.1, messageCount));
        xp *= reductionFactor;
    } else {
        // Gradual recovery: XP multiplier doubles every hour of inactivity
        // Calculate how many hour periods have passed since last message
        const hourPeriods = Math.floor(timeSinceLastMessage / oneHour);
        
        // Start from the reduced state and recover gradually
        // If user had messageCount spam messages, their reduction was 0.1^messageCount (capped at 0.001)
        const initialReduction = Math.max(0.001, Math.pow(0.1, messageCount));
        
        // Each hour period doubles the recovery (reduces the penalty)
        // Recovery factor: 2^periods, but capped at full recovery (1.0)
        const recoveryFactor = Math.min(1.0, initialReduction * Math.pow(2, hourPeriods));
        
        xp *= recoveryFactor;
    }
    
    // Apply server tag multiplier
    if (user && guildId) {
        const tagMultiplier = getServerTagMultiplier(user, guildId);
        xp *= tagMultiplier;
    }
    
    // Ensure minimum XP is 0.0001
    return Math.max(0.0001, xp);
}

function calculateVoiceXPGain(lastVoiceTime, voiceMinuteCount, user, guildId) {
    // Base XP is 1 per minute
    let xp = 1;
    
    // Apply diminishing returns based on 5-minute windows spent in voice
    // Every 5 minutes in voice = 50% reduction
    // voiceMinuteCount represents total minutes spent in voice recently
    const fiveMinuteWindows = Math.floor(voiceMinuteCount / 5);
    
    if (fiveMinuteWindows > 0) {
        // Apply 50% reduction for each 5-minute window
        // Window 1: 50%, Window 2: 25%, Window 3: 12.5%, etc.
        // But never below 0.1% (99.9% reduction max)
        const reductionFactor = Math.max(0.001, Math.pow(0.5, fiveMinuteWindows));
        xp *= reductionFactor;
    }
    
    // Apply server tag multiplier
    if (user && guildId) {
        const tagMultiplier = getServerTagMultiplier(user, guildId);
        xp *= tagMultiplier;
    }
    
    // Ensure minimum XP is 0.0001
    return Math.max(0.0001, xp);
}

function getCurrentGermanDate() {
    // Get current date in German timezone (Europe/Berlin)
    const now = new Date();
    const germanTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
    // Return date string in YYYY-MM-DD format
    return germanTime.toISOString().split('T')[0];
}

function addXP(guildId, userId, username, wordCount, user) {
    const serverData = getServerLevels(guildId);
    const now = Date.now();
    
    // Initialize user if doesn't exist
    if (!serverData.users[userId]) {
        serverData.users[userId] = {
            username: username,
            xp: 0,
            level: 1,
            messageCount: 0,
            lastDailyBonus: null
        };
    }
    
    // Initialize last message tracking if doesn't exist
    if (!serverData.lastMessages[userId]) {
        serverData.lastMessages[userId] = {
            timestamp: 0,
            messageCount: 0
        };
    }
    
    const userData = serverData.users[userId];
    const lastMessage = serverData.lastMessages[userId];
    
    // Calculate message count for diminishing returns
    const timeSinceLastMessage = now - lastMessage.timestamp;
    const fiveMinutes = 5 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;
    
    let messageCount = 0;
    if (timeSinceLastMessage < fiveMinutes) {
        // Still within spam window, increment message count
        messageCount = lastMessage.messageCount + 1;
    } else {
        // 1+ hours have passed, check if penalty should be reduced
        const hourPeriods = Math.floor(timeSinceLastMessage / oneHour);
        
        // Reduce message count by the number of hour periods (but not below 0)
        messageCount = Math.max(0, lastMessage.messageCount - hourPeriods);
    }
    
    // Calculate XP gain (pass Discord user object and guildId for server tag detection)
    let xpGain = calculateXPGain(wordCount, lastMessage.timestamp, messageCount, user, guildId);
    
    // Check for daily bonus (10 XP for first message of the day)
    const currentDate = getCurrentGermanDate();
    if (userData.lastDailyBonus !== currentDate) {
        // User hasn't received daily bonus today, apply it
        xpGain += 10;
        userData.lastDailyBonus = currentDate;
    }
    
    // Update user data
    const oldLevel = userData.level;
    userData.xp += xpGain;
    userData.level = getLevelFromXP(userData.xp);
    userData.username = username; // Update username in case it changed
    userData.messageCount++;
    
    // Update last message tracking
    lastMessage.timestamp = now;
    lastMessage.messageCount = messageCount;
    
    // Save data
    saveServerLevels(guildId, serverData);
    
    // Return level up info if applicable
    const leveledUp = userData.level > oldLevel;
    return {
        xpGain: Math.round(xpGain * 10000) / 10000, // Round to 4 decimal places
        totalXP: Math.round(userData.xp * 10000) / 10000,
        level: userData.level,
        leveledUp: leveledUp,
        oldLevel: oldLevel
    };
}

function addVoiceXP(guildId, userId, username, user) {
    const serverData = getServerLevels(guildId);
    const now = Date.now();
    
    // Initialize user if doesn't exist
    if (!serverData.users[userId]) {
        serverData.users[userId] = {
            username: username,
            xp: 0,
            level: 1,
            messageCount: 0
        };
    }
    
    // Initialize voice tracking if doesn't exist
    if (!serverData.lastVoiceActivity) {
        serverData.lastVoiceActivity = {};
    }
    if (!serverData.lastVoiceActivity[userId]) {
        serverData.lastVoiceActivity[userId] = {
            timestamp: 0,
            voiceMinuteCount: 0
        };
    }
    
    const userData = serverData.users[userId];
    const lastVoice = serverData.lastVoiceActivity[userId];
    
    // Calculate voice minute count for recovery
    const timeSinceLastVoice = now - lastVoice.timestamp;
    const oneHour = 60 * 60 * 1000;
    
    // Every hour away from voice reduces voiceMinuteCount by 5 (one 5-minute window)
    const hourPeriods = Math.floor(timeSinceLastVoice / oneHour);
    const recoveryAmount = hourPeriods * 5; // 5 minutes recovered per hour
    
    // Calculate current voice minute count
        let voiceMinuteCount = Math.max(0, lastVoice.voiceMinuteCount - recoveryAmount + 1);
        // +1 because we're adding this current minute
    // Cap at 50 minutes (10 five-minute windows, which is the max penalty)
    voiceMinuteCount = Math.min(voiceMinuteCount, 50);
    
    // Calculate XP gain (pass Discord user object and guildId for server tag detection)
    const xpGain = calculateVoiceXPGain(lastVoice.timestamp, voiceMinuteCount, user, guildId);
    
    // Update user data
    const oldLevel = userData.level;
    userData.xp += xpGain;
    userData.level = getLevelFromXP(userData.xp);
    userData.username = username; // Update username in case it changed
    
    // Update last voice activity tracking
    lastVoice.timestamp = now;
    lastVoice.voiceMinuteCount = voiceMinuteCount;
    
    // Save data
    saveServerLevels(guildId, serverData);
    
    // Return level up info if applicable
    const leveledUp = userData.level > oldLevel;
    return {
        xpGain: Math.round(xpGain * 10000) / 10000, // Round to 4 decimal places
        totalXP: Math.round(userData.xp * 10000) / 10000,
        level: userData.level,
        leveledUp: leveledUp,
        oldLevel: oldLevel
    };
}

function upsertEntry(guildId, userId, username, day, hour, minute, difficulty) {
    const serverData = getServerScoreboard(guildId);
    // Remove existing entry for this user and difficulty
    serverData.entries = serverData.entries.filter(e => !(e.userId === userId && e.difficulty === difficulty));
    // Add new entry
    serverData.entries.push({ 
        userId, 
        username, 
        day: parseInt(day), 
        hour: parseInt(hour), 
        minute: parseInt(minute), 
        difficulty: difficulty.toUpperCase() 
    });
    saveServerScoreboard(guildId, serverData);
}

async function getScoreboardText(data, client) {
    // Group entries by difficulty
    const difficulties = ['MISERY', 'INTERLOPER', 'STALKER', 'VOYAGEUR', 'PILGRIM', 'CUSTOM'];
    const grouped = {};
    
    // Initialize all difficulty groups
    difficulties.forEach(diff => grouped[diff] = []);
    
    // Group entries by difficulty
    data.entries.forEach(entry => {
        const diff = entry.difficulty.toUpperCase();
        if (grouped[diff]) {
            grouped[diff].push(entry);
        }
    });
    
    // Sort each difficulty group by total time (descending - higher scores first)
    Object.keys(grouped).forEach(diff => {
        grouped[diff].sort((a, b) => {
            const totalA = a.day * 24 * 60 + a.hour * 60 + a.minute;
            const totalB = b.day * 24 * 60 + b.hour * 60 + b.minute;
            return totalB - totalA;
        });
    });
    
    // Calculate maximum widths for alignment across ALL entries
    let maxDayWidth = 1;
    let maxHourWidth = 1;
    let maxMinuteWidth = 1;
    
    data.entries.forEach(entry => {
        maxDayWidth = Math.max(maxDayWidth, entry.day.toString().length);
        maxHourWidth = Math.max(maxHourWidth, entry.hour.toString().length);
        maxMinuteWidth = Math.max(maxMinuteWidth, entry.minute.toString().length);
    });
    
    // Build scoreboard text in code block format
    let text = '```\n';
    
    for (const diff of difficulties) {
        text += `${diff}:\n`;
        if (grouped[diff].length > 0) {
            for (const entry of grouped[diff]) {
                // Format with dynamic spacing based on maximum widths
                const dayStr = entry.day.toString().padStart(maxDayWidth, ' ');
                const hourStr = entry.hour.toString().padStart(maxHourWidth, ' ');
                const minuteStr = entry.minute.toString().padStart(maxMinuteWidth, ' ');
                
                // Fetch current username from Discord
                let username = entry.username; // fallback to stored username
                try {
                    const user = await client.users.fetch(entry.userId);
                    username = user.username;
                } catch (error) {
                    // If user can't be fetched, use stored username as fallback
                    console.log(`Could not fetch user ${entry.userId}, using stored username: ${username}`);
                }
                
                text += `${dayStr}D ${hourStr}H ${minuteStr}M | ${username}\n`;
            }
        }
        text += '\n';
    }
    
    text += '```';
    return text;
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('score')
        .setDescription('Submit your survival score')
        .addIntegerOption(option =>
            option.setName('day')
                .setDescription('Day survived')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('hour')
                .setDescription('Hour survived')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(23))
        .addIntegerOption(option =>
            option.setName('minute')
                .setDescription('Minute survived')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(59))
        .addStringOption(option =>
            option.setName('difficulty')
                .setDescription('Difficulty level')
                .setRequired(true)
                .addChoices(
                    { name: 'Misery', value: 'MISERY' },
                    { name: 'Interloper', value: 'INTERLOPER' },
                    { name: 'Stalker', value: 'STALKER' },
                    { name: 'Voyageur', value: 'VOYAGEUR' },
                    { name: 'Pilgrim', value: 'PILGRIM' },
                    { name: 'Custom', value: 'CUSTOM' }
                )),
    
    new SlashCommandBuilder()
        .setName('scoreboard')
        .setDescription('Create the scoreboard in this channel (one per server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your level or another user\'s level')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check level for (leave empty for yourself)')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('levelboard')
        .setDescription('Create a persistent level scoreboard in this channel (one per server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// Admin-only command to check a user's voice XP penalty
const voiceCooldownCommand = new SlashCommandBuilder()
    .setName('voicecooldown')
    .setDescription('Check how many minutes of voice XP penalty a user currently has')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to check')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
commands.push(voiceCooldownCommand);

// Register commands
async function registerCommands() {
    try {
        console.log('Started refreshing application (/) commands.');
        
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        
        // Clear all existing global commands first
        console.log('Clearing existing global commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [] }
        );
        
        // Get all guilds and register commands for each one (instant update)
        const guilds = client.guilds.cache;
        console.log(`Registering commands for ${guilds.size} guild(s)...`);
        
        for (const [guildId, guild] of guilds) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, guildId),
                    { body: commands }
                );
                console.log(`Commands registered for guild: ${guild.name}`);
            } catch (error) {
                console.error(`Failed to register commands for guild ${guild.name}:`, error);
            }
        }
        
        console.log('Successfully reloaded application (/) commands.');
        
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    
    // Set bot status
    client.user.setPresence({
        activities: [{
            name: '/score to add!',
            type: 0 // PLAYING
        }],
        status: 'online'
    });
    
    // Scan for existing scoreboards on startup
    await scanExistingScoreboards();
    
    registerCommands();
    
    // Start hourly levelboard updates
    startLevelboardUpdates();
});

// Function to assign level roles to users based on their level
async function assignLevelRoles(guildId, serverData) {
    if (!serverData.users) return;
    
    try {
        const guild = await client.guilds.fetch(guildId);
        
        // Process each user with level data
        for (const [userId, userData] of Object.entries(serverData.users)) {
            if (userData.level >= 1) {
                try {
                    const member = await guild.members.fetch(userId);
                    const targetLevel = userData.level;
                    const targetRoleName = `Level ${targetLevel}`;
                    
                    // Find or create the level role
                    let levelRole = guild.roles.cache.find(role => role.name === targetRoleName);
                    if (!levelRole) {
                        levelRole = await guild.roles.create({
                            name: targetRoleName,
                            color: 'Random', // Random color for each level
                            reason: `Auto-created level role for level ${targetLevel} users`
                        });
                        console.log(`Created "${targetRoleName}" role in guild ${guild.name}`);
                    }
                    
                    // Remove any old level roles from this user
                    const oldLevelRoles = member.roles.cache.filter(role => 
                        role.name.startsWith('Level ') && role.name !== targetRoleName
                    );
                    
                    for (const oldRole of oldLevelRoles.values()) {
                        if (member.roles.cache.has(oldRole.id)) {
                            await member.roles.remove(oldRole);
                            console.log(`Removed old role "${oldRole.name}" from ${userData.username}`);
                        }
                    }
                    
                    // Add the correct level role if they don't already have it
                    if (!member.roles.cache.has(levelRole.id)) {
                        await member.roles.add(levelRole);
                        console.log(`Assigned "${targetRoleName}" role to ${userData.username} (Level ${userData.level})`);
                    }
                } catch (memberError) {
                    // User might have left the server
                    console.log(`Could not fetch member ${userId} for level role assignment`);
                }
            }
        }
    } catch (error) {
        console.log(`Error managing level roles for guild ${guildId}:`, error.message);
    }
}

// Function to update all levelboards every 5 minutes
function startLevelboardUpdates() {
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    setInterval(async () => {
        console.log('Running 5-minute levelboard updates...');
        
        try {
            const allLevelData = loadLevels();
            
            for (const [guildId, serverData] of Object.entries(allLevelData)) {
                const operationKey = `levelboard_${guildId}`;
                
                // Skip if manual operation is in progress
                if (levelboardOperations.has(operationKey)) {
                    console.log(`[DEBUG] Skipping automatic update for guild ${guildId} - manual operation in progress`);
                    continue;
                }
                
                if (serverData.levelboardChannelId && serverData.levelboardMessageId) {
                    try {
                        const channel = await client.channels.fetch(serverData.levelboardChannelId);
                        const levelboardMsg = await channel.messages.fetch(serverData.levelboardMessageId);
                        await levelboardMsg.edit(await getLevelboardText(serverData, client));
                        console.log(`Updated levelboard for guild ${guildId}`);
                    } catch (error) {
                        console.log(`Could not update levelboard for guild ${guildId}:`, error.message);
                        // Remove invalid references
                        serverData.levelboardChannelId = null;
                        serverData.levelboardMessageId = null;
                        saveServerLevels(guildId, serverData);
                    }
                }
                
                // Check and assign level roles to users
                try {
                    await assignLevelRoles(guildId, serverData);
                } catch (error) {
                    console.log(`Could not assign level roles for guild ${guildId}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Error during 5-minute levelboard update:', error);
        }
    }, fiveMinutes);
    
    console.log('Hourly levelboard updates started!');
}

// Function to scan all servers for existing scoreboard messages
async function scanExistingScoreboards() {
    console.log('Scanning for existing scoreboards...');
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            console.log(`Scanning guild: ${guild.name}`);
            const serverData = getServerScoreboard(guildId);
            
            // If we already have data for this server, skip
            if (serverData.messageId && serverData.channelId) {
                console.log(`  - Already have scoreboard data for ${guild.name}`);
                continue;
            }
            
            // Search through all text channels for scoreboard messages
            const channels = guild.channels.cache.filter(channel => 
                channel.isTextBased() && channel.permissionsFor(client.user).has('ReadMessageHistory')
            );
            
            let foundScoreboard = false;
            
            for (const [channelId, channel] of channels) {
                try {
                    // Look for recent messages that look like scoreboards
                    const messages = await channel.messages.fetch({ limit: 50 });
                    
                    for (const [messageId, message] of messages) {
                        // Check if this looks like a scoreboard (contains code block with difficulty names)
                        if (message.author.id === client.user.id && 
                            message.content.includes('```') && 
                            message.content.includes('MISERY:') && 
                            message.content.includes('INTERLOPER:')) {
                            
                            console.log(`  - Found existing scoreboard in #${channel.name}`);
                            
                            // Save this as the server's scoreboard
                            serverData.messageId = messageId;
                            serverData.channelId = channelId;
                            saveServerScoreboard(guildId, serverData);
                            
                            foundScoreboard = true;
                            break;
                        }
                    }
                    
                    if (foundScoreboard) break;
                    
                } catch (error) {
                    // Skip channels we can't read
                    continue;
                }
            }
            
            if (!foundScoreboard) {
                console.log(`  - No existing scoreboard found for ${guild.name}`);
            }
            
        } catch (error) {
            console.error(`Error scanning guild ${guild.name}:`, error.message);
        }
    }
    
    console.log('Finished scanning for existing scoreboards.');
}

// Handle messages for XP system
client.on('messageCreate', async message => {
    // Ignore bot messages and DMs
    if (message.author.bot || !message.guild) return;
    
    // Count words in the message
    const words = message.content.trim().split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    if (wordCount === 0) return; // No words, no XP
    
    // Add XP to user
    const result = addXP(message.guild.id, message.author.id, message.author.username, wordCount, message.author);
    
    // Notify on level up (optional - you can remove this if you don't want notifications)
    if (result.leveledUp) {
        try {
            await message.react('🎉');
        } catch (error) {
            console.log('Could not send level up notification:', error.message);
        }
    }
});

// Track voice activity for XP
const voiceTracking = new Map(); // Map to track users currently in voice channels

client.on('voiceStateUpdate', (oldState, newState) => {
    const userId = newState.member.id;
    const guildId = newState.guild.id;
    const username = newState.member.user.username;
    
    // User joined a voice channel
    if (!oldState.channelId && newState.channelId) {
        // Start tracking this user
        voiceTracking.set(userId, {
            guildId: guildId,
            username: username,
            user: newState.member.user, // Store the Discord user object for server tag detection
            joinTime: Date.now(),
            interval: setInterval(() => {
                // Award XP every minute
                try {
                    const trackingData = voiceTracking.get(userId);
                    if (trackingData) {
                        const result = addVoiceXP(guildId, userId, username, trackingData.user);
                        console.log(`Voice XP awarded to ${username}: +${result.xpGain} XP (Total: ${result.totalXP}, Level: ${result.level})`);
                        
                        // Check for level up
                        if (result.leveledUp) {
                            console.log(`🎉 ${username} leveled up to level ${result.level}!`);
                            // Optionally send level up notification to a channel here
                        }
                    }
                } catch (error) {
                    console.log('Error awarding voice XP:', error.message);
                }
            }, 60000) // 60 seconds = 1 minute
        });
        
        console.log(`${username} joined voice channel in ${newState.guild.name}`);
    }
    
    // User left a voice channel
    if (oldState.channelId && !newState.channelId) {
        // Stop tracking this user
        const tracking = voiceTracking.get(userId);
        if (tracking) {
            clearInterval(tracking.interval);
            voiceTracking.delete(userId);
            
            const timeInVoice = Date.now() - tracking.joinTime;
            const minutesInVoice = Math.floor(timeInVoice / 60000);
            console.log(`${username} left voice channel after ${minutesInVoice} minutes`);
        }
    }
    
    // User switched voice channels (still in voice, just different channel)
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // No need to restart tracking, they're still in voice
        console.log(`${username} switched voice channels`);
    }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    // Prevent duplicate processing using interaction ID
    const interactionKey = `${interaction.id}_${interaction.commandName}`;
    if (processedInteractions.has(interactionKey)) {
        console.log(`[DEBUG] Interaction ${interaction.id} already processed, skipping...`);
        return;
    }
    
    // Prevent duplicate processing using replied/deferred status
    if (interaction.replied || interaction.deferred) {
        console.log('[DEBUG] Interaction already processed (replied/deferred), skipping...');
        return;
    }
    
    // Mark this interaction as being processed
    processedInteractions.add(interactionKey);
    
    // Clean up old interaction IDs after 5 minutes to prevent memory leak
    setTimeout(() => {
        processedInteractions.delete(interactionKey);
    }, 5 * 60 * 1000);
    
    const { commandName } = interaction;
    
    if (commandName === 'score') {
        const day = interaction.options.getInteger('day');
        const hour = interaction.options.getInteger('hour');
        const minute = interaction.options.getInteger('minute');
        const difficulty = interaction.options.getString('difficulty');
        
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const guildId = interaction.guild.id;
        
        try {
            // Update scoreboard data for this server
            upsertEntry(guildId, userId, username, day, hour, minute, difficulty);
            const scoreboardData = getServerScoreboard(guildId);
            
            // Update the scoreboard message if it exists for this server
            if (scoreboardData.channelId && scoreboardData.messageId) {
                try {
                    const channel = await client.channels.fetch(scoreboardData.channelId);
                    const scoreboardMsg = await channel.messages.fetch(scoreboardData.messageId);
                    await scoreboardMsg.edit(await getScoreboardText(scoreboardData, client));
                } catch (e) {
                    console.log('Could not update scoreboard message:', e.message);
                }
            }
            
            await interaction.reply({ 
                content: `✅ Score submitted: Day ${day}, ${hour}h ${minute}m on ${difficulty}`, 
                ephemeral: true 
            });
            
        } catch (error) {
            console.error('Score submission error:', error);
            await interaction.reply({ 
                content: '❌ Error submitting score. Please try again.', 
                ephemeral: true 
            });
        }
    }
    
    else if (commandName === 'scoreboard') {
        try {
            const guildId = interaction.guild.id;
            const scoreboardData = getServerScoreboard(guildId);
            
            // Check if a scoreboard already exists for this server
            if (scoreboardData.channelId && scoreboardData.messageId) {
                try {
                    // Try to fetch the existing message to see if it still exists
                    const existingChannel = await client.channels.fetch(scoreboardData.channelId);
                    const existingMessage = await existingChannel.messages.fetch(scoreboardData.messageId);
                    
                    if (existingMessage) {
                        await interaction.reply({ 
                            content: `❌ Scoreboard already exists in <#${scoreboardData.channelId}>! Delete that message first if you want to create a new one.`, 
                            ephemeral: true 
                        });
                        return;
                    }
                } catch (e) {
                    // Message was deleted, we can create a new one
                    console.log('Existing scoreboard message was deleted, creating new one...');
                }
            }
            
            const channel = interaction.channel;
            
            // Create new scoreboard message
            const scoreboardMsg = await channel.send(await getScoreboardText(scoreboardData, client));
            
            // Update data with new message info for this server
            scoreboardData.channelId = channel.id;
            scoreboardData.messageId = scoreboardMsg.id;
            saveServerScoreboard(guildId, scoreboardData);
            
            await interaction.reply({ 
                content: '✅ Scoreboard created in this channel!', 
                ephemeral: true 
            });
            
        } catch (error) {
            console.error('Scoreboard creation error:', error);
            await interaction.reply({ 
                content: '❌ Error creating scoreboard. Please try again.', 
                ephemeral: true 
            });
        }
    }
    
    else if (commandName === 'level') {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guild.id;
            const serverData = getServerLevels(guildId);
            
            if (!serverData.users[targetUser.id]) {
                const selfCheck = targetUser.id === interaction.user.id;
                await interaction.reply({ 
                    content: selfCheck ? 
                        '📊 You haven\'t sent any messages yet! Start chatting to gain XP and levels.' : 
                        `📊 ${targetUser.username} hasn't sent any messages yet!`, 
                    ephemeral: true 
                });
                return;
            }
            
            const userData = serverData.users[targetUser.id];
            const currentXP = Math.round(userData.xp * 10000) / 10000;
            const currentLevel = userData.level;
            const nextLevelXP = getXPRequiredForLevel(currentLevel + 1);
            const currentLevelXP = getXPRequiredForLevel(currentLevel);
            const progressXP = currentXP - currentLevelXP;
            const neededXP = nextLevelXP - currentLevelXP;
            
            // Calculate user's rank
            const sortedUsers = Object.entries(serverData.users)
                .sort(([,a], [,b]) => b.xp - a.xp);
            const userRank = sortedUsers.findIndex(([userId]) => userId === targetUser.id) + 1;
            
            // Calculate current cooldown modifiers using the actual XP calculation functions
            const now = Date.now();
            
            // Chat modifier calculation - use actual calculateXPGain function
            let chatModifier = 1.0;
            if (serverData.lastMessages && serverData.lastMessages[targetUser.id]) {
                const lastMessage = serverData.lastMessages[targetUser.id];
                const timeSinceLastMessage = now - lastMessage.timestamp;
                const fiveMinutes = 5 * 60 * 1000;
                const oneHour = 60 * 60 * 1000;
                
                let messageCount = 0;
                if (timeSinceLastMessage < fiveMinutes) {
                    messageCount = lastMessage.messageCount + 1;
                } else {
                    const hourPeriods = Math.floor(timeSinceLastMessage / oneHour);
                    messageCount = Math.max(0, lastMessage.messageCount - hourPeriods);
                }
                
                // Get the actual XP gain for 1 word to determine the current modifier
                const actualXPGain = calculateXPGain(1, lastMessage.timestamp, messageCount, null, null);
                chatModifier = actualXPGain; // This already includes all penalties but not server tag
            }
            
            // Voice modifier calculation - use actual calculateVoiceXPGain function
            let voiceModifier = 1.0;
            if (serverData.lastVoiceActivity && serverData.lastVoiceActivity[targetUser.id]) {
                const lastVoice = serverData.lastVoiceActivity[targetUser.id];
                const timeSinceLastVoice = now - lastVoice.timestamp;
                const oneHour = 60 * 60 * 1000;
                
                // Use the EXACT same logic as addVoiceXP function
                const hourPeriods = Math.floor(timeSinceLastVoice / oneHour);
                const recoveryAmount = hourPeriods * 5; // 5 minutes recovered per hour
                
                // Calculate current voice minute count using the exact same formula as addVoiceXP
                // (but without the +1 since we're not adding a new minute, just checking current state)
                const currentVoiceMinuteCount = Math.max(0, lastVoice.voiceMinuteCount - recoveryAmount);
                
                // DEBUG: Add some logging to see what's happening
                console.log(`[DEBUG] Voice penalty for ${targetUser.username}:`);
                console.log(`  Stored voice minutes: ${lastVoice.voiceMinuteCount}`);
                console.log(`  Hours since last voice: ${hourPeriods}`);
                console.log(`  Recovery amount: ${recoveryAmount}`);
                console.log(`  Current voice minutes: ${currentVoiceMinuteCount}`);
                console.log(`  Five-minute windows: ${Math.floor(currentVoiceMinuteCount / 5)}`);
                
                // Get the actual XP gain for voice to determine the current modifier
                const actualVoiceXPGain = calculateVoiceXPGain(lastVoice.timestamp, currentVoiceMinuteCount, null, null);
                console.log(`  Calculated XP gain: ${actualVoiceXPGain}`);
                voiceModifier = actualVoiceXPGain; // This already includes all penalties but not server tag
            }
            
            const progressPercent = Math.round((progressXP / neededXP) * 100);
            const progressBar = '█'.repeat(Math.floor(progressPercent / 5)) + '░'.repeat(20 - Math.floor(progressPercent / 5));
            
            const selfCheck = targetUser.id === interaction.user.id;
            
            // Get the user's display name (prioritize server nickname, then global display name, then username)
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            const displayName = member ? member.displayName : (targetUser.displayName || targetUser.username);
            
            // Calculate actual multipliers (displayed as additive bonuses)
            const baseMultiplier = 1.0;
            const serverTagRawMultiplier = getServerTagMultiplier(targetUser, guildId);
            const serverTagBonusMultiplier = serverTagRawMultiplier - 1.0; // Convert 2x to +1x bonus
            const totalMultiplier = baseMultiplier + serverTagBonusMultiplier;
            
            // Build multiplier breakdown text
            let multiplierBreakdown = `- Base [${baseMultiplier}x]`;
            if (serverTagBonusMultiplier > 0) {
                multiplierBreakdown += `\n- Server Tag [${serverTagBonusMultiplier}x]`;
            }
            
            const embed = {
                color: 0x00ff00,
                author: {
                    name: `${displayName}'s Level Stats`,
                    icon_url: targetUser.displayAvatarURL({ dynamic: true, size: 128 })
                },
                fields: [
                    {
                        name: 'Level',
                        value: `**${currentLevel}**`,
                        inline: true
                    },
                    {
                        name: 'Total XP',
                        value: `**${currentXP.toFixed(2)}**`,
                        inline: true
                    },
                    {
                        name: 'Messages Sent',
                        value: `**${userData.messageCount.toLocaleString()}**`,
                        inline: true
                    },
                    {
                        name: 'Rank',
                        value: `**#${userRank}**`,
                        inline: true
                    },
                    {
                        name: 'Chat Modifier',
                        value: `**${chatModifier.toFixed(3)}x**`,
                        inline: true
                    },
                    {
                        name: 'Voice Modifier',
                        value: `**${voiceModifier.toFixed(3)}x**`,
                        inline: true
                    },
                    {
                        name: `Current XP Rate: ${totalMultiplier}x`,
                        value: multiplierBreakdown,
                        inline: false
                    },
                    {
                        name: 'Progress to Next Level',
                        value: `\`${progressBar}\` ${progressPercent}%\n**${Math.round(progressXP)}** / **${Math.round(neededXP)}** XP`,
                        inline: false
                    }
                ],
                timestamp: new Date().toISOString()
            };
            
            await interaction.reply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Level command error:', error);
            await interaction.reply({ 
                content: '❌ Error getting level information. Please try again.', 
                ephemeral: true 
            });
        }
    }
    
    
    else if (commandName === 'levelboard') {
        const guildId = interaction.guild.id;
        const interactionId = interaction.id;
        
        // Check if we've already processed this exact interaction
        if (processedInteractions.has(interactionId)) {
            console.log(`[DEBUG] Already processed interaction ${interactionId}, ignoring duplicate...`);
            return;
        }
        
        // Mark this interaction as processed immediately
        processedInteractions.add(interactionId);
        
        // Clean up old interaction IDs after 5 minutes
        setTimeout(() => {
            processedInteractions.delete(interactionId);
        }, 300000);
        
        const operationKey = `levelboard_${guildId}`;
        
        // Prevent duplicate operations
        if (levelboardOperations.has(operationKey)) {
            console.log(`[DEBUG] Levelboard operation already in progress for guild ${guildId}, skipping...`);
            await interaction.reply({ 
                content: '⏳ Levelboard operation already in progress...', 
                ephemeral: true 
            });
            return;
        }
        
        // Immediately defer the reply to acknowledge the interaction
        await interaction.deferReply({ ephemeral: true });
        
        levelboardOperations.add(operationKey);
        
        try {
            // Get current server data with all XP and user info
            let serverData = getServerLevels(guildId);
            const channel = interaction.channel;
            
            // Clear old levelboard info (don't need to delete the old message)
            serverData.levelboardChannelId = null;
            serverData.levelboardMessageId = null;
            
            // Create new levelboard message in the current channel
            const levelboardText = await getLevelboardText(serverData, client);
            const levelboardMsg = await channel.send(levelboardText);
            
            // Save new levelboard location
            serverData.levelboardChannelId = channel.id;
            serverData.levelboardMessageId = levelboardMsg.id;
            saveServerLevels(guildId, serverData);
            
            // Update the reply to success
            await interaction.editReply({ 
                content: '✅ Level scoreboard created in this channel! It will update automatically every 5 minutes.'
            });
            
        } catch (error) {
            console.error('Levelboard creation error:', error);
            try {
                await interaction.editReply({ 
                    content: '❌ Error creating level scoreboard. Please try again.'
                });
            } catch (replyError) {
                console.error('Failed to edit reply:', replyError);
            }
        } finally {
            // Always remove the operation lock
            levelboardOperations.delete(operationKey);
        }
    }
    
    else if (commandName === 'voicecooldown') {
        // Only allow admins
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        const targetUser = interaction.options.getUser('user');
        const guildId = interaction.guild.id;
        const serverData = getServerLevels(guildId);
        let minutes = 0;
        if (serverData.lastVoiceActivity && serverData.lastVoiceActivity[targetUser.id]) {
            const lastVoice = serverData.lastVoiceActivity[targetUser.id];
            const now = Date.now();
            const timeSinceLastVoice = now - lastVoice.timestamp;
            const oneHour = 60 * 60 * 1000;
            const hourPeriods = Math.floor(timeSinceLastVoice / oneHour);
            const recoveryAmount = hourPeriods * 5;
            minutes = Math.max(0, lastVoice.voiceMinuteCount - recoveryAmount); // Ignore 35 min cap
        }
        await interaction.reply({ content: `${targetUser.username} currently has ${minutes} minute(s) of voice XP penalty remaining (actual stored value).`, ephemeral: true });
        return;
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Cleanup voice tracking on shutdown
process.on('SIGINT', () => {
    console.log('Bot shutting down, cleaning up voice tracking...');
    for (const tracking of voiceTracking.values()) {
        clearInterval(tracking.interval);
    }
    voiceTracking.clear();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Bot shutting down, cleaning up voice tracking...');
    for (const tracking of voiceTracking.values()) {
        clearInterval(tracking.interval);
    }
    voiceTracking.clear();
    process.exit(0);
});

// Login to Discord
if (!TOKEN || !CLIENT_ID) {
    console.error('Please make sure tokens.txt has your bot token on line 1 and client ID on line 2!');
    process.exit(1);
}

client.login(TOKEN);