import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import * as db from './database';
import { ITrade } from '../models/Trade';

/**
 * Generate and send a daily trading summary
 */
export async function generateDailySummary(client: Client): Promise<void> {
  try {
    const channelId = process.env.TRADE_CHANNEL_ID;
    if (!channelId) {
      console.error('TRADE_CHANNEL_ID not configured in environment variables');
      return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(`Could not find text channel with ID ${channelId}`);
      return;
    }

    // Generate the daily summary
    const summary = await createTradingSummary();
    
    // Send the summary to the channel
    await channel.send({ embeds: [summary] });
    console.log('Daily trading summary sent');
  } catch (error) {
    console.error('Error generating daily summary:', error);
  }
}

/**
 * Create a trading summary embed
 */
async function createTradingSummary(): Promise<EmbedBuilder> {
  // Get all trades
  const allTrades = await getAllTrades();
  
  // Get today's date (without time)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Filter trades for today
  const todaysTrades = allTrades.filter(trade => {
    const tradeDate = new Date(trade.updatedAt);
    tradeDate.setHours(0, 0, 0, 0);
    return tradeDate.getTime() === today.getTime();
  });
  
  // Calculate profit/loss for the day
  const dailyPL = calculateDailyProfitLoss(todaysTrades);
  
  // Get open trades (positions that haven't been fully closed)
  const openTrades = allTrades.filter(trade => trade.isOpen);
  
  // Create the embed
  const embed = new EmbedBuilder()
    .setTitle('📊 Daily Trading Summary')
    .setColor(dailyPL.totalPL >= 0 ? '#32CD32' : '#FF0000')
    .setDescription(`Here's your trading summary for ${today.toLocaleDateString()}`)
    .setTimestamp();
  
  // Add daily profit/loss field
  embed.addFields({
    name: '📈 Daily Profit/Loss',
    value: formatProfitLoss(dailyPL),
    inline: false
  });
  
  // Add today's trades
  if (todaysTrades.length > 0) {
    const tradesField = formatTodaysTrades(todaysTrades);
    embed.addFields({
      name: '🔄 Today\'s Trades',
      value: tradesField,
      inline: false
    });
  } else {
    embed.addFields({
      name: '🔄 Today\'s Trades',
      value: 'No trades were made today.',
      inline: false
    });
  }
  
  // Add open positions
  if (openTrades.length > 0) {
    const openPositionsField = formatOpenPositions(openTrades);
    embed.addFields({
      name: '📝 Open Positions',
      value: openPositionsField,
      inline: false
    });
  } else {
    embed.addFields({
      name: '📝 Open Positions',
      value: 'You have no open positions.',
      inline: false
    });
  }
  
  return embed;
}

/**
 * Get all trades from the database
 */
async function getAllTrades(): Promise<ITrade[]> {
  // This is a simplification; you might need to adjust this to get all users' trades
  // For now, we're assuming a single user system or aggregating all trades
  const users = await getAllUserIds();
  let allTrades: ITrade[] = [];
  
  for (const userId of users) {
    const userTrades = await db.findTradesByUserId(userId);
    allTrades = [...allTrades, ...userTrades];
  }
  
  return allTrades;
}

/**
 * Get all user IDs from the database
 * This is a placeholder function - you'll need to implement this based on your system
 */
async function getAllUserIds(): Promise<string[]> {
  // This is a placeholder - you might need to implement actual user tracking
  // For simplicity, we're returning a hard-coded admin user ID
  return [process.env.ADMIN_USER_ID || ''].filter(id => id !== '');
}

/**
 * Calculate profit/loss for the day
 */
interface DailyPL {
  totalPL: number;
  winningTrades: number;
  losingTrades: number;
  totalTrades: number;
  tradeDetails: Array<{
    stock: string;
    contract: string;
    pl: number;
    notes: string;
  }>;
}

function calculateDailyProfitLoss(trades: ITrade[]): DailyPL {
  const result: DailyPL = {
    totalPL: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalTrades: 0,
    tradeDetails: []
  };
  
  // Only consider trades with sell transactions today
  const tradesWithSellToday = trades.filter(trade => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return trade.sellPrices.some(sell => {
      const sellDate = new Date(sell.date);
      sellDate.setHours(0, 0, 0, 0);
      return sellDate.getTime() === today.getTime();
    });
  });
  
  for (const trade of tradesWithSellToday) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's sell transactions
    const todaySells = trade.sellPrices.filter(sell => {
      const sellDate = new Date(sell.date);
      sellDate.setHours(0, 0, 0, 0);
      return sellDate.getTime() === today.getTime();
    });
    
    let tradePL = 0;
    
    // Calculate P/L for each sell transaction
    for (const sell of todaySells) {
      const buyAmount = trade.buyPrice * sell.quantity * 100; // Multiply by 100 for contract value
      const sellAmount = sell.price * sell.quantity * 100;
      const pl = sellAmount - buyAmount;
      tradePL += pl;
    }
    
    result.totalPL += tradePL;
    result.totalTrades++;
    
    if (tradePL >= 0) {
      result.winningTrades++;
    } else {
      result.losingTrades++;
    }
    
    // Add trade details
    result.tradeDetails.push({
      stock: trade.stock,
      contract: trade.contract,
      pl: tradePL,
      notes: trade.notes
    });
  }
  
  return result;
}

/**
 * Format profit/loss for display
 */
function formatProfitLoss(dailyPL: DailyPL): string {
  const formattedPL = dailyPL.totalPL.toFixed(2);
  const sign = dailyPL.totalPL >= 0 ? '+' : '';
  
  let message = `**Total: $${formattedPL} (${sign}${((dailyPL.totalPL / 100) * 100).toFixed(2)}%)**\n\n`;
  
  if (dailyPL.totalTrades > 0) {
    message += `Trades: ${dailyPL.totalTrades} (${dailyPL.winningTrades} winning, ${dailyPL.losingTrades} losing)\n`;
    message += `Win Rate: ${((dailyPL.winningTrades / dailyPL.totalTrades) * 100).toFixed(0)}%\n\n`;
    
    // Add detail for each trade
    dailyPL.tradeDetails.forEach(trade => {
      const plSign = trade.pl >= 0 ? '+' : '';
      message += `• ${trade.stock} ${trade.contract}: $${trade.pl.toFixed(2)} (${plSign}${trade.pl.toFixed(2)})\n`;
      
      if (trade.notes) {
        message += `  📝 *${trade.notes}*\n`;
      }
    });
  }
  
  return message;
}

/**
 * Format today's trades for display
 */
function formatTodaysTrades(trades: ITrade[]): string {
  if (trades.length === 0) {
    return 'No trades were made today.';
  }
  
  let message = '';
  
  // Group trades by stock for better presentation
  const tradesByStock: Record<string, ITrade[]> = {};
  
  for (const trade of trades) {
    if (!tradesByStock[trade.stock]) {
      tradesByStock[trade.stock] = [];
    }
    tradesByStock[trade.stock].push(trade);
  }
  
  // Format each stock's trades
  for (const [stock, stockTrades] of Object.entries(tradesByStock)) {
    message += `**${stock}**\n`;
    
    for (const trade of stockTrades) {
      const expirationDate = new Date(trade.expiration).toLocaleDateString();
      
      if (trade.soldQuantity > 0) {
        // Format sell transaction
        const lastSell = trade.sellPrices[trade.sellPrices.length - 1];
        const buyAmount = trade.buyPrice * lastSell.quantity * 100;
        const sellAmount = lastSell.price * lastSell.quantity * 100;
        const pl = sellAmount - buyAmount;
        const plSign = pl >= 0 ? '+' : '';
        
        message += `• SELL ${lastSell.quantity} ${trade.contract} (Exp. ${expirationDate}): $${lastSell.price} → $${pl.toFixed(2)} (${plSign}${((pl / buyAmount) * 100).toFixed(2)}%)\n`;
      } else {
        // Format buy transaction
        message += `• BUY ${trade.buyQuantity} ${trade.contract} (Exp. ${expirationDate}): $${trade.buyPrice}\n`;
      }
      
      if (trade.notes) {
        message += `  📝 *${trade.notes}*\n`;
      }
    }
    
    message += '\n';
  }
  
  return message;
}

/**
 * Format open positions for display
 */
function formatOpenPositions(trades: ITrade[]): string {
  if (trades.length === 0) {
    return 'You have no open positions.';
  }
  
  let message = '';
  
  // Group by stock
  const positionsByStock: Record<string, ITrade[]> = {};
  
  for (const trade of trades) {
    if (!positionsByStock[trade.stock]) {
      positionsByStock[trade.stock] = [];
    }
    positionsByStock[trade.stock].push(trade);
  }
  
  // Format each stock's positions
  for (const [stock, positions] of Object.entries(positionsByStock)) {
    message += `**${stock}**\n`;
    
    for (const position of positions) {
      const expirationDate = new Date(position.expiration).toLocaleDateString();
      const remainingQuantity = position.buyQuantity - position.soldQuantity;
      
      message += `• ${remainingQuantity} ${position.contract} @ $${position.buyPrice} (Exp. ${expirationDate})\n`;
      
      // Calculate time to expiration
      const daysToExpiration = getDaysToExpiration(new Date(position.expiration));
      
      if (daysToExpiration <= 0) {
        message += `  ⚠️ **EXPIRED TODAY**\n`;
      } else if (daysToExpiration === 1) {
        message += `  ⚠️ **EXPIRES TOMORROW**\n`;
      } else if (daysToExpiration <= 3) {
        message += `  ⚠️ **EXPIRES IN ${daysToExpiration} DAYS**\n`;
      } else {
        message += `  ⏱️ ${daysToExpiration} days to expiration\n`;
      }
      
      if (position.notes) {
        message += `  📝 *${position.notes}*\n`;
      }
    }
    
    message += '\n';
  }
  
  return message;
}

/**
 * Calculate days to expiration
 */
function getDaysToExpiration(expirationDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expDay = new Date(expirationDate);
  expDay.setHours(0, 0, 0, 0);
  
  const diffTime = expDay.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
} 