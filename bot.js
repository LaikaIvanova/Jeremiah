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
    errorWithTimestamp('Error reading tokens.txt file: ' + error.message);
    errorWithTimestamp('Make sure tokens.txt exists with your bot token on line 1 and client ID on line 2');
    process.exit(1);
}

// Prevent duplicate levelboard operations
const levelboardOperations = new Set();

// Track processed interactions to prevent duplicates
const processedInteractions = new Set();

// Scoreboard data file
const SCOREBOARD_FILE = path.join(__dirname, 'data', 'scoreboard.json');
const LEVELS_FILE = path.join(__dirname, 'data', 'levels.json');
const RECOVERY_CONFIG_FILE = path.join(__dirname, 'data', 'recovery_config.txt');

// Create data directory if it doesn't exist
if (!fs.existsSync(path.dirname(SCOREBOARD_FILE))) {
    fs.mkdirSync(path.dirname(SCOREBOARD_FILE), { recursive: true });
}

// Helper function to get current German time timestamp for logging
function getTimestamp() {
    const now = new Date();
    const germanTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
    const hours = germanTime.getHours().toString().padStart(2, '0');
    const minutes = germanTime.getMinutes().toString().padStart(2, '0');
    return `[${hours}:${minutes}]`;
}

// Enhanced console.log with timestamp
function logWithTimestamp(message) {
    console.log(`${getTimestamp()} ${message}`);
}

// Enhanced console.error with timestamp
function errorWithTimestamp(message) {
    console.error(`${getTimestamp()} ${message}`);
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
        errorWithTimestamp(`Error reading quotes for ${username}: ` + error);
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
    try {
        if (!fs.existsSync(LEVELS_FILE)) {
            return {};
        }
        const data = fs.readFileSync(LEVELS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        errorWithTimestamp('Error loading levels file: ' + error);
        logWithTimestamp('Creating backup and starting with empty levels data');
        
        // Try to create a backup if file exists but is corrupted
        if (fs.existsSync(LEVELS_FILE)) {
            try {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = `${LEVELS_FILE}.backup-${timestamp}`;
                fs.copyFileSync(LEVELS_FILE, backupPath);
                logWithTimestamp(`Corrupted levels file backed up to: ${backupPath}`);
            } catch (backupError) {
                errorWithTimestamp('Could not create backup: ' + backupError);
            }
        }
        
        return {};
    }
}

function saveLevels(data) {
    try {
        fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        errorWithTimestamp('Error writing levels file: ' + error);
        throw error;
    }
}

function loadRecoveryConfig() {
    if (!fs.existsSync(RECOVERY_CONFIG_FILE)) {
        // Default values
        return {
            channelId: "1419282967733342279",
            messageId: "1421725310243704915"
        };
    }
    try {
        const content = fs.readFileSync(RECOVERY_CONFIG_FILE, 'utf8').trim().split('\n');
        return {
            channelId: content[0] || "1419282967733342279",
            messageId: content[1] || "1421725310243704915"
        };
    } catch (error) {
        errorWithTimestamp('Error reading recovery config: ' + error);
        return {
            channelId: "1419282967733342279",
            messageId: "1421725310243704915"
        };
    }
}

function saveRecoveryConfig(channelId, messageId) {
    const content = `${channelId}\n${messageId}`;
    fs.writeFileSync(RECOVERY_CONFIG_FILE, content, 'utf8');
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
async function hasServerTag(user, guildId) {
    try {
        // Method 1: Try the user profile endpoint with proper authentication
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        
        // Try different possible endpoints for user profile/clan data
        let userProfile;
        
        try {
            // Primary method: User profile with guild context
            userProfile = await rest.get(`/users/${user.id}/profile`, {
                query: new URLSearchParams({ 
                    guild_id: guildId,
                    with_mutual_guilds: 'true',
                    with_mutual_friends_count: 'false'
                })
            });
        } catch (profileError) {
            // Alternative method: Try guild member endpoint with additional data
            try {
                const member = await rest.get(`/guilds/${guildId}/members/${user.id}`);
                
                // Check if member data contains clan/tag information
                if (member.user && member.user.clan) {
                    userProfile = { user_profile: { clan: member.user.clan } };
                }
            } catch (memberError) {
                return false;
            }
        }
        
        // Check if user has a clan tag (server tag) applied for this guild
        if (userProfile && userProfile.user_profile && userProfile.user_profile.clan) {
            const clan = userProfile.user_profile.clan;
            
            // Verify the clan tag is for this specific guild
            const hasTag = clan.identity_guild_id === guildId && clan.identity_enabled === true;
            return hasTag;
        }
        
        return false;
        
    } catch (error) {
        return false;
    }
}

async function getServerTagMultiplier(user, guildId) {
    // Give double XP for displaying server tag
    if (await hasServerTag(user, guildId)) {
        return 2.0; // 100% bonus (double XP) for displaying server tag
    }
    return 1.0;
}

function saveServerLevels(guildId, serverData) {
    try {
        const allData = loadLevels();
        allData[guildId] = serverData;
        saveLevels(allData);
    } catch (error) {
        errorWithTimestamp(`Error saving server levels for guild ${guildId}: ` + error);
        throw error; // Re-throw so calling function knows save failed
    }
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
    
    // Calculate maximum XP width (including decimals and commas)
    const maxXP = Math.max(...sortedUsers.map(([,userData]) => userData.xp));
    const maxXPFormatted = maxXP.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const xpWidth = maxXPFormatted.length;
    
    let scoreboard = '```\nLEVEL SCOREBOARD:\n';
    
    // User entries - fetch current usernames dynamically
    for (const [userId, userData] of sortedUsers) {
        const level = userData.level.toString().padStart(levelWidth, ' ');
        const xp = userData.xp.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(xpWidth, ' '); // Right-align XP with 2 decimals
        
        // Fetch current username from Discord
        let username = userData.username; // fallback to stored username
        try {
            const user = await client.users.fetch(userId);
            username = user.username;
        } catch (error) {
            // If user can't be fetched, use stored username as fallback
            logWithTimestamp(`Could not fetch user ${userId}, using stored username: ${username}`);
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
    
    // Note: Server tag multiplier will be applied asynchronously by caller
    // to avoid making this function async (for backwards compatibility)
    
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
        // But never below 0.01% (99.99% reduction max)
        const reductionFactor = Math.max(0.0001, Math.pow(0.5, fiveMinuteWindows));
        xp *= reductionFactor;
    }
    
    // Note: Server tag multiplier will be applied asynchronously by caller
    // to avoid making this function async (for backwards compatibility)
    
    // Ensure minimum XP is 0.0001
    return Math.max(0.0001, xp);
}

async function recoverDataFromLevelboard(client) {
    const recoveryConfig = loadRecoveryConfig();
    const RECOVERY_CHANNEL_ID = recoveryConfig.channelId;
    const RECOVERY_MESSAGE_ID = recoveryConfig.messageId;
    const GUILD_ID = "1416823209113686089"; // Your server ID
    
    logWithTimestamp(`🔄 Attempting to sync with remote levelboard...`);
    logWithTimestamp(`📍 Channel ID: ${RECOVERY_CHANNEL_ID}`);
    logWithTimestamp(`📍 Message ID: ${RECOVERY_MESSAGE_ID}`);
    
    try {
        // Get the channel and message
        const channel = await client.channels.fetch(RECOVERY_CHANNEL_ID);
        const message = await channel.messages.fetch(RECOVERY_MESSAGE_ID);
        
        if (!message || !message.content) {
            logWithTimestamp('❌ Could not find levelboard message for recovery');
            return false;
        }
        
        logWithTimestamp('📋 Found remote levelboard, parsing user data...');
        
        // Parse the levelboard content - handle both old and new formats
        const content = message.content;
        logWithTimestamp(`📏 Message content length: ${content.length} characters`);
        const lines = content.split('\n');
        logWithTimestamp(`📝 Found ${lines.length} lines to parse`);
        
        const recoveredUsers = {};
        let recoveredCount = 0;
        
        // Pre-fetch guild and members to avoid repeated fetches
        logWithTimestamp('👥 Fetching guild members...');
        const guild = await client.guilds.fetch(GUILD_ID);
        const members = await guild.members.fetch();
        logWithTimestamp(`👥 Loaded ${members.size} guild members`);
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            logWithTimestamp(`🔍 Processing line ${i + 1}/${lines.length}: ${line.substring(0, 50)}...`);
            
            // Match format: "level | xp.xx XP | username" (with decimals)
            // Also support old format: "level | xp XP | username" (without decimals)
            const match = line.match(/^\s*(\d+)\s*\|\s*([0-9,]+(?:\.\d{2})?)\s*XP\s*\|\s*(.+)$/);
            if (match) {
                const level = parseInt(match[1]);
                const xp = parseFloat(match[2].replace(/,/g, '')); // Handle decimals and remove commas
                const username = match[3].trim();
                
                logWithTimestamp(`🔍 Parsed: Level ${level}, XP ${xp}, Username: ${username}`);
                
                // Try to find the user ID by username
                const member = members.find(m => m.user.username === username);
                
                if (member) {
                    recoveredUsers[member.user.id] = {
                        username: username,
                        xp: xp,
                        level: level,
                        messageCount: 0,
                        lastDailyBonus: null
                    };
                    recoveredCount++;
                    logWithTimestamp(`✅ Synced: ${username} (Level ${level}, ${xp} XP)`);
                } else {
                    logWithTimestamp(`⚠️  User not found in server: ${username}`);
                }
            } else {
                logWithTimestamp(`❌ Line didn't match pattern: ${line}`);
            }
        }
        
        if (recoveredCount > 0) {
            // Preserve existing lastMessages and lastVoiceActivity data if it exists
            const existingData = getServerLevels(GUILD_ID);
            
            // Create the server data structure
            const serverData = {
                users: recoveredUsers,
                lastMessages: existingData.lastMessages || {},
                lastVoiceActivity: existingData.lastVoiceActivity || {},
                levelboardChannelId: RECOVERY_CHANNEL_ID,
                levelboardMessageId: RECOVERY_MESSAGE_ID
            };
            
            // Save the synced data
            saveServerLevels(GUILD_ID, serverData);
            logWithTimestamp(`🎉 Successfully synced ${recoveredCount} users from remote levelboard!`);
            return true;
        } else {
            logWithTimestamp('❌ No user data could be parsed from remote levelboard');
            return false;
        }
        
    } catch (error) {
        errorWithTimestamp('[\x1b[31mERROR\x1b[0m] Remote data sync failed: ' + error.message);
        return false;
    }
}

async function checkAndRecoverData(client) {
    const GUILD_ID = "1416823209113686089";
    
    logWithTimestamp('🔄 Starting data recovery from remote levelboard...');
    
    // Always attempt to recover the latest data from remote levelboard with timeout
    let recovered = false;
    try {
        // Add 30-second timeout to prevent hanging
        const recoveryPromise = recoverDataFromLevelboard(client);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Recovery timeout after 30 seconds')), 30000)
        );
        
        recovered = await Promise.race([recoveryPromise, timeoutPromise]);
    } catch (error) {
        logWithTimestamp('⏰ Recovery timed out or failed: ' + error.message);
        recovered = false;
    }
    
    if (recovered) {
        logWithTimestamp('✅ Successfully synced with remote levelboard data!');
    } else {
        logWithTimestamp('⚠️  Remote sync failed, checking for existing local data...');
        
        // If remote recovery failed, check if we have local data as fallback
        const existingData = getServerLevels(GUILD_ID);
        const hasUsers = existingData.users && Object.keys(existingData.users).length > 0;
        
        if (hasUsers) {
            logWithTimestamp(`📊 Using existing local data for ${Object.keys(existingData.users).length} users`);
        } else {
            logWithTimestamp('📝 No local data found, starting with fresh data');
        }
    }
}

function getCurrentGermanDate() {
    try {
        // Get current date in German timezone (Europe/Berlin)
        const now = new Date();
        const germanTime = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Berlin"}));
        // Return date string in YYYY-MM-DD format
        return germanTime.toISOString().split('T')[0];
    } catch (error) {
        errorWithTimestamp('Error getting German date: ' + error);
        // Fallback to UTC date if timezone conversion fails
        const now = new Date();
        return now.toISOString().split('T')[0];
    }
}

async function addXP(guildId, userId, username, wordCount, user) {
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
    
    // Ensure lastDailyBonus exists for existing users (migration fix)
    if (!serverData.users[userId].hasOwnProperty('lastDailyBonus')) {
        serverData.users[userId].lastDailyBonus = null;
    }
    
    // Initialize last message tracking if doesn't exist
    if (!serverData.lastMessages[userId]) {
        serverData.lastMessages[userId] = {
            timestamp: 0,
            messageCount: 0,
            lastLoggedPercentage: null // Track last logged chat penalty percentage
        };
    }
    
    // Ensure lastLoggedPercentage exists for existing users (migration)
    if (!serverData.lastMessages[userId].hasOwnProperty('lastLoggedPercentage')) {
        serverData.lastMessages[userId].lastLoggedPercentage = null;
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
    
    // Apply server tag multiplier
    const tagMultiplier = await getServerTagMultiplier(user, guildId);
    const baseXPWithTag = xpGain * tagMultiplier;
    
    // Check if chat penalty percentage changed and log only if it did
    // Calculate percentage based on base XP per word (0.1 XP per word = 100%)
    const baseXPPerWord = 0.1 * tagMultiplier; // Base with server tag multiplier
    const currentPercentage = (baseXPWithTag / wordCount / baseXPPerWord) * 100;
    
    if (lastMessage.lastLoggedPercentage !== null && 
        Math.abs(currentPercentage - lastMessage.lastLoggedPercentage) >= 0.01) {
        
        const formattedPercentage = currentPercentage.toLocaleString('de-DE', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        logWithTimestamp(`[DEBUG] Chat penalty for ${username}: ${formattedPercentage}%`);
    }
    
    // Always update the tracked percentage
    lastMessage.lastLoggedPercentage = currentPercentage;
    
    xpGain = baseXPWithTag;
    
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
    
    // Save data with error handling
    try {
        saveServerLevels(guildId, serverData);
    } catch (saveError) {
        errorWithTimestamp(`Failed to save XP data for user ${username} (${userId}): ` + saveError);
        // Don't throw here - we still want to return the XP info even if save failed
        // The user did gain XP in memory, just wasn't persisted
    }
    
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

async function addVoiceXP(guildId, userId, username, user) {
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
    
    // Ensure lastDailyBonus exists for existing users (migration fix)
    if (!serverData.users[userId].hasOwnProperty('lastDailyBonus')) {
        serverData.users[userId].lastDailyBonus = null;
    }
    
    // Initialize voice tracking if doesn't exist
    if (!serverData.lastVoiceActivity) {
        serverData.lastVoiceActivity = {};
    }
    if (!serverData.lastVoiceActivity[userId]) {
        serverData.lastVoiceActivity[userId] = {
            timestamp: 0,
            voiceMinuteCount: 0,
            lastLoggedPercentage: null // Track last logged penalty percentage
        };
    }
    
    // Ensure lastLoggedPercentage exists for existing users (migration)
    if (!serverData.lastVoiceActivity[userId].hasOwnProperty('lastLoggedPercentage')) {
        serverData.lastVoiceActivity[userId].lastLoggedPercentage = null;
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
    let xpGain = calculateVoiceXPGain(lastVoice.timestamp, voiceMinuteCount, user, guildId);
    
    // Apply server tag multiplier
    const tagMultiplier = await getServerTagMultiplier(user, guildId);
    const finalXPRate = xpGain * tagMultiplier;
    
    // Check if penalty percentage changed and log only if it did (show base rate without server tag effect)
    const baseCurrentPercentage = xpGain * 100; // Base rate without server tag
    if (lastVoice.lastLoggedPercentage !== null && 
        Math.abs(baseCurrentPercentage - lastVoice.lastLoggedPercentage) >= 0.01) {
        
        const formattedPercentage = baseCurrentPercentage.toLocaleString('de-DE', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        logWithTimestamp(`[DEBUG] Voice penalty for ${username}: ${formattedPercentage}%`);
    }
    
    // Always update the tracked percentage (use base rate for consistency)
    lastVoice.lastLoggedPercentage = baseCurrentPercentage;
    
    xpGain = finalXPRate;
    
    // Update user data
    const oldLevel = userData.level;
    userData.xp += xpGain;
    userData.level = getLevelFromXP(userData.xp);
    userData.username = username; // Update username in case it changed
    
    // Update last voice activity tracking
    lastVoice.timestamp = now;
    lastVoice.voiceMinuteCount = voiceMinuteCount;
    
    // Save data with error handling
    try {
        saveServerLevels(guildId, serverData);
    } catch (saveError) {
        errorWithTimestamp(`Failed to save voice XP data for user ${username} (${userId}): ` + saveError);
        // Don't throw here - we still want to return the XP info even if save failed
    }
    
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
                    logWithTimestamp(`Could not fetch user ${entry.userId}, using stored username: ${username}`);
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
        // Removing privileged intents for now due to Discord portal issues
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

// Admin-only command to update recovery config
const recoveryConfigCommand = new SlashCommandBuilder()
    .setName('recoveryconfig')
    .setDescription('Update the levelboard message IDs for data recovery')
    .addStringOption(option =>
        option.setName('channel_id')
            .setDescription('Channel ID containing the levelboard')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('message_id')
            .setDescription('Message ID of the levelboard')
            .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
commands.push(recoveryConfigCommand);

// Admin-only command to debug user properties for server tag detection
const debugUserCommand = new SlashCommandBuilder()
    .setName('debuguser')
    .setDescription('Debug: Dump all user and member properties to a file for server tag detection')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to debug (leave empty for yourself)')
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
commands.push(debugUserCommand);

// Admin-only command to test server tag detection
const testServerTagCommand = new SlashCommandBuilder()
    .setName('testservertag')
    .setDescription('Test: Check if a user has a server tag applied')
    .addUserOption(option =>
        option.setName('user')
            .setDescription('User to check (leave empty for yourself)')
            .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
commands.push(testServerTagCommand);

// Register commands
async function registerCommands() {
    try {
        logWithTimestamp('Started refreshing application (/) commands.');
        
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        
        // Clear all existing global commands first
        logWithTimestamp('Clearing existing global commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: [] }
        );
        
        // Get all guilds and register commands for each one (instant update)
        const guilds = client.guilds.cache;
        logWithTimestamp(`Registering commands for ${guilds.size} guild(s)...`);
        
        for (const [guildId, guild] of guilds) {
            try {
                await rest.put(
                    Routes.applicationGuildCommands(CLIENT_ID, guildId),
                    { body: commands }
                );
                logWithTimestamp(`Commands registered for guild: ${guild.name}`);
            } catch (error) {
                errorWithTimestamp(`Failed to register commands for guild ${guild.name}: ` + error);
            }
        }
        
        logWithTimestamp('Successfully reloaded application (/) commands.');
        
    } catch (error) {
        errorWithTimestamp('Error registering commands: ' + error);
    }
}

// Bot ready event
client.once('ready', async () => {
    logWithTimestamp(`Ready! Logged in as ${client.user.tag}`);
    
    // Check and recover data if needed
    await checkAndRecoverData(client);
    
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
                        logWithTimestamp(`Created "${targetRoleName}" role in guild ${guild.name}`);
                    }
                    
                    // Check if user already has the correct role and no old roles
                    const hasCorrectRole = member.roles.cache.has(levelRole.id);
                    const oldLevelRoles = member.roles.cache.filter(role => 
                        role.name.startsWith('Level ') && role.name !== targetRoleName
                    );
                    const hasOldRoles = oldLevelRoles.size > 0;
                    
                    // Only perform role operations if there's a mismatch
                    if (hasOldRoles || !hasCorrectRole) {
                        // Remove any old level roles from this user
                        let rolesChanged = false;
                        for (const oldRole of oldLevelRoles.values()) {
                            if (member.roles.cache.has(oldRole.id)) {
                                await member.roles.remove(oldRole);
                                logWithTimestamp(`Removed old role "${oldRole.name}" from ${userData.username}`);
                                rolesChanged = true;
                            }
                        }
                        
                        // Add the correct level role if they don't already have it
                        if (!member.roles.cache.has(levelRole.id)) {
                            await member.roles.add(levelRole);
                            logWithTimestamp(`Assigned "${targetRoleName}" role to ${userData.username} (Level ${userData.level})`);
                            rolesChanged = true;
                        }
                    }
                } catch (memberError) {
                    // User might have left the server
                    logWithTimestamp(`Could not fetch member ${userId} for level role assignment`);
                }
            }
        }
    } catch (error) {
        logWithTimestamp(`Error managing level roles for guild ${guildId}: ` + error.message);
    }
}

// Function to update voice and chat recovery and log penalty changes
async function updatePenaltyRecovery() {
    try {
        const allLevelData = loadLevels();
        let dataChanged = false;
        
        for (const [guildId, serverData] of Object.entries(allLevelData)) {
            // Handle voice recovery
            if (serverData.lastVoiceActivity) {
                for (const [userId, lastVoice] of Object.entries(serverData.lastVoiceActivity)) {
                    if (!lastVoice.timestamp) continue;
                    
                    const now = Date.now();
                    const timeSinceLastVoice = now - lastVoice.timestamp;
                    const oneHour = 60 * 60 * 1000;
                    
                    // Calculate recovery
                    const hourPeriods = Math.floor(timeSinceLastVoice / oneHour);
                    const recoveryAmount = hourPeriods * 5;
                    const newVoiceMinuteCount = Math.max(0, lastVoice.voiceMinuteCount - recoveryAmount);
                    
                    // Update the voice minute count if it changed due to recovery
                    if (newVoiceMinuteCount !== lastVoice.voiceMinuteCount) {
                        lastVoice.voiceMinuteCount = newVoiceMinuteCount;
                        lastVoice.timestamp = now - (timeSinceLastVoice % oneHour); // Adjust timestamp for recovery
                        dataChanged = true;
                        
                        // Calculate the new penalty percentage and log if changed
                        const userData = serverData.users && serverData.users[userId];
                        if (userData) {
                            // Get user object for server tag calculation (we need guild context)
                            const guild = client.guilds.cache.get(guildId);
                            if (guild) {
                                try {
                                    const member = await guild.members.fetch(userId);
                                    const user = member.user;
                                    
                                    // Calculate with server tag multiplier
                                    const baseXPGain = calculateVoiceXPGain(lastVoice.timestamp, newVoiceMinuteCount, null, null);
                                    const tagMultiplier = await getServerTagMultiplier(user, guildId);
                                    const finalXPRate = baseXPGain * tagMultiplier;
                                    const baseCurrentPercentage = baseXPGain * 100; // Base rate without server tag
                                    
                                    // Only log if percentage changed (use base rate for consistency)
                                    if (lastVoice.lastLoggedPercentage === null || 
                                        Math.abs(baseCurrentPercentage - lastVoice.lastLoggedPercentage) >= 0.01) {
                                        
                                        const formattedPercentage = baseCurrentPercentage.toLocaleString('de-DE', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        });
                                        
                                        logWithTimestamp(`[DEBUG] Voice penalty for ${userData.username}: ${formattedPercentage}% (recovery)`);
                                        lastVoice.lastLoggedPercentage = baseCurrentPercentage;
                                        dataChanged = true; // Mark data as changed to save the logged percentage
                                    }
                                } catch (memberError) {
                                    // User not in guild anymore, skip logging
                                }
                            }
                        }
                    }
                }
            }
            
            // Handle chat recovery
            if (serverData.lastMessages) {
                for (const [userId, lastMessage] of Object.entries(serverData.lastMessages)) {
                    if (!lastMessage.timestamp) continue;
                    
                    const now = Date.now();
                    const timeSinceLastMessage = now - lastMessage.timestamp;
                    const oneHour = 60 * 60 * 1000;
                    
                    // Calculate recovery
                    const hourPeriods = Math.floor(timeSinceLastMessage / oneHour);
                    const newMessageCount = Math.max(0, lastMessage.messageCount - hourPeriods);
                    
                    // Update the message count if it changed due to recovery
                    if (newMessageCount !== lastMessage.messageCount) {
                        lastMessage.messageCount = newMessageCount;
                        dataChanged = true;
                        
                        // Calculate the new penalty percentage and log if changed
                        const userData = serverData.users && serverData.users[userId];
                        if (userData) {
                            // Get user object for server tag calculation
                            const guild = client.guilds.cache.get(guildId);
                            if (guild) {
                                try {
                                    const member = await guild.members.fetch(userId);
                                    const user = member.user;
                                    
                                    // Calculate chat penalty with server tag multiplier
                                    const baseXPGain = calculateXPGain(1, lastMessage.timestamp, newMessageCount, null, null); // 1 word for calculation
                                    const tagMultiplier = await getServerTagMultiplier(user, guildId);
                                    const finalXPRate = baseXPGain * tagMultiplier;
                                    const baseXPPerWord = 0.1 * tagMultiplier; // Base XP per word with server tag
                                    const currentPercentage = (finalXPRate / baseXPPerWord) * 100;
                                    
                                    // Only log if percentage changed
                                    if (lastMessage.lastLoggedPercentage === null || 
                                        Math.abs(currentPercentage - lastMessage.lastLoggedPercentage) >= 0.01) {
                                        
                                        const formattedPercentage = currentPercentage.toLocaleString('de-DE', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        });
                                        
                                        logWithTimestamp(`[DEBUG] Chat penalty for ${userData.username}: ${formattedPercentage}% (recovery)`);
                                        lastMessage.lastLoggedPercentage = currentPercentage;
                                        dataChanged = true; // Mark data as changed to save the logged percentage
                                    }
                                } catch (memberError) {
                                    // User not in guild anymore, skip logging
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Save only if data actually changed
        if (dataChanged) {
            saveLevels(allLevelData);
        }
    } catch (error) {
        errorWithTimestamp('Error updating penalty recovery: ' + error);
    }
}

// Function to update all levelboards every hour
function startLevelboardUpdates() {
    const oneHour = 60 * 60 * 1000; // 60 minutes in milliseconds
    
    logWithTimestamp('[DEBUG] Setting up 60-minute levelboard update interval...');
    
    setInterval(async () => {
        const germanTime = new Date().toLocaleTimeString('de-DE', { 
            timeZone: 'Europe/Berlin', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        logWithTimestamp(`[DEBUG] Updating Levelboard (${germanTime})`);
        
        try {
            const allLevelData = loadLevels();
            
            for (const [guildId, serverData] of Object.entries(allLevelData)) {
                const operationKey = `levelboard_${guildId}`;
                
                // Skip if bot is not in this guild
                const guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    continue;
                }
                
                // Skip if manual operation is in progress
                if (levelboardOperations.has(operationKey)) {
                    continue;
                }
                
                if (serverData.levelboardChannelId && serverData.levelboardMessageId) {
                    try {
                        const channel = await client.channels.fetch(serverData.levelboardChannelId);
                        const levelboardMsg = await channel.messages.fetch(serverData.levelboardMessageId);
                        await levelboardMsg.edit(await getLevelboardText(serverData, client));
                        // Levelboard updated silently
                    } catch (error) {
                        logWithTimestamp(`Could not update levelboard for guild ${guildId}: ` + error.message);
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
                    logWithTimestamp(`Could not assign level roles for guild ${guildId}: ` + error.message);
                }
            }
            
            // Update voice and chat recovery for all users
            await updatePenaltyRecovery();
            
        } catch (error) {
            errorWithTimestamp('Error during 60-minute levelboard update: ' + error);
        }
    }, oneHour);
    
    logWithTimestamp('60-minute levelboard updates started!');
}

// Function to scan all servers for existing scoreboard messages
async function scanExistingScoreboards() {
    logWithTimestamp('Scanning for existing scoreboards...');
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            logWithTimestamp(`Scanning guild: ${guild.name}`);
            const serverData = getServerScoreboard(guildId);
            
            // If we already have data for this server, skip
            if (serverData.messageId && serverData.channelId) {
                logWithTimestamp(`  - Already have scoreboard data for ${guild.name}`);
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
                            
                            logWithTimestamp(`  - Found existing scoreboard in #${channel.name}`);
                            
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
                logWithTimestamp(`  - No existing scoreboard found for ${guild.name}`);
            }
            
        } catch (error) {
            errorWithTimestamp(`Error scanning guild ${guild.name}: ` + error.message);
        }
    }
    
    logWithTimestamp('Finished scanning for existing scoreboards.');
}

// Handle messages for XP system
client.on('messageCreate', async message => {
    try {
        // Ignore bot messages and DMs
        if (message.author.bot || !message.guild) return;
        
        // Count words in the message
        const words = message.content.trim().split(/\s+/).filter(word => word.length > 0);
        const wordCount = words.length;
        
        if (wordCount === 0) return; // No words, no XP
        
        // Add XP to user
        const result = await addXP(message.guild.id, message.author.id, message.author.username, wordCount, message.author);
        
        // Log chat XP award (similar to voice XP logging)
        logWithTimestamp(`[INFO] Chat XP awarded to ${message.author.username}: +${result.xpGain} XP (${wordCount} words) (Total: ${result.totalXP}, Level: ${result.level})`);
        
        // Notify on level up (optional - you can remove this if you don't want notifications)
        if (result.leveledUp) {
            logWithTimestamp(`[INFO] 🎉 ${message.author.username} leveled up from level ${result.oldLevel} to level ${result.level}!`);
            try {
                await message.react('🎉');
            } catch (error) {
                logWithTimestamp('Could not send level up notification: ' + error.message);
            }
        }
    } catch (error) {
        errorWithTimestamp('Error processing message for XP system: ' + error);
        errorWithTimestamp('Message details: ' + JSON.stringify({
            guildId: message.guild?.id,
            userId: message.author?.id,
            username: message.author?.username,
            content: message.content?.substring(0, 100) // First 100 chars for debugging
        }));
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
            interval: setInterval(async () => {
                // Award XP every minute
                try {
                    const trackingData = voiceTracking.get(userId);
                    if (trackingData) {
                        const result = await addVoiceXP(guildId, userId, username, trackingData.user);
                        logWithTimestamp(`[INFO] Voice XP awarded to ${username}: +${result.xpGain} XP (Total: ${result.totalXP}, Level: ${result.level})`);
                        
                        // Check for level up
                        if (result.leveledUp) {
                            logWithTimestamp(`[INFO] 🎉 ${username} leveled up to level ${result.level}!`);
                            // Optionally send level up notification to a channel here
                        }
                    }
                } catch (error) {
                    logWithTimestamp(`[\x1b[31mERROR\x1b[0m] Error awarding voice XP: ` + error.message);
                }
            }, 60000) // 60 seconds = 1 minute
        });

        logWithTimestamp(`[INFO] ${username} joined voice channel in ${newState.guild.name}`);
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
            logWithTimestamp(`[INFO] ${username} left voice channel after ${minutesInVoice} minutes`);
        }
    }
    
    // User switched voice channels (still in voice, just different channel)
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        // No need to restart tracking, they're still in voice
        logWithTimestamp(`[INFO] ${username} switched voice channels`);
    }
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    // Prevent duplicate processing using interaction ID
    const interactionKey = `${interaction.id}_${interaction.commandName}`;
    if (processedInteractions.has(interactionKey)) {
        logWithTimestamp(`[DEBUG] Interaction ${interaction.id} already processed, skipping...`);
        return;
    }
    
    // Prevent duplicate processing using replied/deferred status
    if (interaction.replied || interaction.deferred) {
        logWithTimestamp('[DEBUG] Interaction already processed (replied/deferred), skipping...');
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
                    logWithTimestamp(`[\x1b[31mERROR\x1b[0m] Could not update scoreboard message: ` + e.message);
                }
            }
            
            await interaction.reply({ 
                content: `✅ Score submitted: Day ${day}, ${hour}h ${minute}m on ${difficulty}`, 
                ephemeral: true 
            });
            
        } catch (error) {
            errorWithTimestamp(`[\x1b[31mERROR\x1b[0m] Score submission error: ` + error);
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
                    logWithTimestamp('[DEBUG] Existing scoreboard message was deleted, creating new one...');
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
            errorWithTimestamp('Scoreboard creation error: ' + error);
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
                chatModifier = actualXPGain / 0.1; // Normalize to baseline (0.1 XP per word is now 1.0x)
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
                
                // Get the actual XP gain for voice to determine the current modifier
                const actualVoiceXPGain = calculateVoiceXPGain(lastVoice.timestamp, currentVoiceMinuteCount, null, null);
                
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
            const serverTagRawMultiplier = await getServerTagMultiplier(targetUser, guildId);
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
            errorWithTimestamp('Level command error: ' + error);
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
            logWithTimestamp(`[DEBUG] Already processed interaction ${interactionId}, ignoring duplicate...`);
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
            logWithTimestamp(`[DEBUG] Levelboard operation already in progress for guild ${guildId}, skipping...`);
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
                content: '✅ Level scoreboard created in this channel! It will update automatically every minute.'
            });
            
        } catch (error) {
            errorWithTimestamp('Levelboard creation error: ' + error);
            try {
                await interaction.editReply({ 
                    content: '❌ Error creating level scoreboard. Please try again.'
                });
            } catch (replyError) {
                errorWithTimestamp('Failed to edit reply: ' + replyError);
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
    else if (commandName === 'recoveryconfig') {
        // Check if user is admin
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        
        const channelId = interaction.options.getString('channel_id');
        const messageId = interaction.options.getString('message_id');
        
        // Validate the IDs (basic validation)
        if (!/^\d{17,19}$/.test(channelId) || !/^\d{17,19}$/.test(messageId)) {
            await interaction.reply({ content: 'Invalid channel or message ID format. IDs should be 17-19 digit numbers.', ephemeral: true });
            return;
        }
        
        try {
            // Test if we can fetch the message to validate the IDs
            const channel = await client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId);
            
            // Save the new configuration
            saveRecoveryConfig(channelId, messageId);
            
            await interaction.reply({ 
                content: `✅ Recovery configuration updated successfully!\n` +
                        `Channel ID: ${channelId}\n` +
                        `Message ID: ${messageId}\n` +
                        `Configuration saved to recovery_config.txt`,
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: `❌ Error: Could not fetch the message with the provided IDs. Please verify the channel and message IDs are correct.\n\nError: ${error.message}`,
                ephemeral: true 
            });
        }
        return;
    }
    
    else if (commandName === 'debuguser') {
        // Check if user is admin
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
            return;
        }
        
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;
        
        try {
            // Fetch guild and member info
            const guild = interaction.guild;
            const member = await guild.members.fetch(targetUser.id);
            
            // Function to safely extract object properties
            function extractProperties(obj, name) {
                const result = {
                    [`${name}_type`]: typeof obj,
                    [`${name}_constructor`]: obj?.constructor?.name || 'unknown',
                    [`${name}_properties`]: [],
                    [`${name}_values`]: {}
                };
                
                if (obj && typeof obj === 'object') {
                    try {
                        // Get all property names including non-enumerable ones
                        const allProps = Object.getOwnPropertyNames(obj);
                        result[`${name}_properties`] = allProps;
                        
                        // Get values for ALL properties, not just enumerable ones
                        for (const prop of allProps) {
                            try {
                                const value = obj[prop];
                                if (typeof value !== 'function') {
                                    if (typeof value === 'object' && value !== null) {
                                        // For objects, extract more detailed information
                                        if (Array.isArray(value)) {
                                            result[`${name}_values`][prop] = {
                                                type: 'array',
                                                length: value.length,
                                                items: value.slice(0, 10) // First 10 items to avoid huge arrays
                                            };
                                        } else if (value instanceof Map) {
                                            result[`${name}_values`][prop] = {
                                                type: 'Map',
                                                size: value.size,
                                                keys: Array.from(value.keys()).slice(0, 10)
                                            };
                                        } else if (value instanceof Set) {
                                            result[`${name}_values`][prop] = {
                                                type: 'Set',
                                                size: value.size,
                                                values: Array.from(value).slice(0, 10)
                                            };
                                        } else {
                                            // For other objects, get nested properties recursively (but only 1 level deep)
                                            const nestedProps = Object.getOwnPropertyNames(value);
                                            const nestedValues = {};
                                            for (const nestedProp of nestedProps.slice(0, 20)) { // Limit to prevent too much data
                                                try {
                                                    const nestedValue = value[nestedProp];
                                                    if (typeof nestedValue !== 'function' && typeof nestedValue !== 'object') {
                                                        nestedValues[nestedProp] = nestedValue;
                                                    } else if (typeof nestedValue === 'object' && nestedValue !== null) {
                                                        nestedValues[nestedProp] = {
                                                            type: typeof nestedValue,
                                                            constructor: nestedValue.constructor?.name || 'unknown'
                                                        };
                                                    }
                                                } catch (e) {
                                                    nestedValues[nestedProp] = `[Error: ${e.message}]`;
                                                }
                                            }
                                            result[`${name}_values`][prop] = {
                                                type: typeof value,
                                                constructor: value.constructor?.name || 'unknown',
                                                properties: nestedProps,
                                                values: nestedValues
                                            };
                                        }
                                    } else {
                                        // For primitive values, store directly
                                        result[`${name}_values`][prop] = value;
                                    }
                                } else {
                                    // For functions, just note it's a function
                                    result[`${name}_values`][prop] = '[Function]';
                                }
                            } catch (e) {
                                result[`${name}_values`][prop] = `[Error accessing property: ${e.message}]`;
                            }
                        }
                    } catch (e) {
                        result[`${name}_error`] = e.message;
                    }
                }
                
                return result;
            }
            
            // Collect all data
            const debugData = {
                timestamp: new Date().toISOString(),
                target_user_id: targetUser.id,
                target_username: targetUser.username,
                guild_id: guildId,
                guild_name: guild.name,
                
                // User object analysis
                ...extractProperties(targetUser, 'user'),
                
                // Member object analysis
                ...extractProperties(member, 'member'),
                
                // Guild object analysis
                ...extractProperties(guild, 'guild'),
                
                // Special focus on potential server identity properties
                special_checks: {
                    user_flags: targetUser.flags ? {
                        bitfield: targetUser.flags.bitfield,
                        array: targetUser.flags.toArray?.() || 'no toArray method',
                        has_method: typeof targetUser.flags.has === 'function'
                    } : null,
                    
                    member_flags: member.flags ? {
                        bitfield: member.flags.bitfield,
                        array: member.flags.toArray?.() || 'no toArray method', 
                        has_method: typeof member.flags.has === 'function'
                    } : null,
                    
                    guild_features: guild.features,
                    
                    member_avatar: member.avatar,
                    user_avatar: targetUser.avatar,
                    member_banner: member.banner,
                    user_banner: targetUser.banner,
                    
                    member_premium_since: member.premiumSince,
                    member_display_name: member.displayName,
                    member_nickname: member.nickname,
                    
                    // Check for any identity-related properties
                    potential_identity_props: {
                        user_primary_guild: targetUser.primaryGuild,
                        user_identity_enabled: targetUser.identityEnabled,
                        user_identity_guild_id: targetUser.identityGuildId,
                        member_guild_avatar: member.avatar,
                        member_guild_identity: member.guildIdentity,
                        member_server_identity: member.serverIdentity,
                        member_identity: member.identity
                    }
                }
            };
            
            // Save to file
            const filename = `debug_user_${targetUser.id}_${Date.now()}.json`;
            const filepath = path.join(__dirname, 'data', filename);
            
            fs.writeFileSync(filepath, JSON.stringify(debugData, null, 2), 'utf8');
            
            await interaction.reply({ 
                content: `✅ Debug data saved to \`${filename}\`\n` +
                        `Target: ${targetUser.username} (${targetUser.id})\n` +
                        `Check the data folder for the complete property dump.`,
                ephemeral: true 
            });
            
        } catch (error) {
            errorWithTimestamp('Debug user command error: ' + error);
            await interaction.reply({ 
                content: `❌ Error collecting debug data: ${error.message}`,
                ephemeral: true 
            });
        }
        return;
    }
    else if (commandName === 'testservertag') {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guild.id;
            
            await interaction.deferReply({ ephemeral: true });
            
            // Test server tag detection
            const hasTag = await hasServerTag(targetUser, guildId);
            const multiplier = await getServerTagMultiplier(targetUser, guildId);
            
            await interaction.editReply({
                content: `🔍 **Server Tag Detection Test**\n` +
                        `**User:** ${targetUser.username} (${targetUser.id})\n` +
                        `**Has Server Tag:** ${hasTag ? '✅ Yes' : '❌ No'}\n` +
                        `**XP Multiplier:** ${multiplier}x\n` +
                        `**Guild:** ${interaction.guild.name} (${guildId})\n\n` +
                        `${hasTag ? '🎉 This user should get 2x XP bonus!' : '📝 This user gets normal XP rates.'}`,
                ephemeral: true
            });
            
        } catch (error) {
            errorWithTimestamp('Test server tag command error: ' + error);
            await interaction.editReply({ 
                content: `❌ Error testing server tag detection: ${error.message}\n\n` +
                        `**Error Details:**\n\`\`\`${error.stack || error.toString()}\`\`\``,
                ephemeral: true 
            });
        }
        return;
    }
});

// Error handling
client.on('error', error => {
    errorWithTimestamp('Discord client error: ' + error);
});

process.on('unhandledRejection', error => {
    errorWithTimestamp('Unhandled promise rejection: ' + error);
});

// Cleanup voice tracking on shutdown
process.on('SIGINT', () => {
    logWithTimestamp('Bot shutting down, cleaning up voice tracking...');
    for (const tracking of voiceTracking.values()) {
        clearInterval(tracking.interval);
    }
    voiceTracking.clear();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logWithTimestamp('Bot shutting down, cleaning up voice tracking...');
    for (const tracking of voiceTracking.values()) {
        clearInterval(tracking.interval);
    }
    voiceTracking.clear();
    process.exit(0);
});

// Login to Discord
if (!TOKEN || !CLIENT_ID) {
    errorWithTimestamp('Please make sure tokens.txt has your bot token on line 1 and client ID on line 2!');
    process.exit(1);
}

client.login(TOKEN);