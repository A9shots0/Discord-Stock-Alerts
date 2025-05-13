import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalSubmitInteraction, 
  ButtonInteraction,
  TextInputComponentData,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  ModalActionRowComponentBuilder,
  ChatInputCommandInteraction,
  TextChannel
} from 'discord.js';

import { createTrade, updateTradeOnSell, ITrade } from '../models/Trade';
import * as db from '../services/database';
import { analyzeTrade } from '../services/openai';

// Command data
export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('Manage your stock option trades')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add a new trade')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('sell')
      .setDescription('Record a sell for an existing trade')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List your open trades')
  );

// Execute the command
export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    // Create modal for adding a new trade
    const modal = new ModalBuilder()
      .setCustomId('trade_add_modal')
      .setTitle('Add New Trade');

    // Add form inputs
    const stockInput = new TextInputBuilder()
      .setCustomId('stock')
      .setLabel('Stock Symbol')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const contractAndExpirationInput = new TextInputBuilder()
      .setCustomId('contract_expiration')
      .setLabel('Contract & Exp (e.g., CALL $150 05/17)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity')
      .setStyle(TextInputStyle.Short)
      .setValue('1')
      .setRequired(true);

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price per Contract')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
      
    const notesInput = new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    // Add inputs to rows
    const firstRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(stockInput);
    const secondRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(contractAndExpirationInput);
    const thirdRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(quantityInput);
    const fourthRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(priceInput);
    const fifthRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(notesInput);

    // Add rows to modal
    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow, fifthRow);

    // Show modal to user
    await interaction.showModal(modal);
  } else if (subcommand === 'sell') {
    // Get user's open trades
    const openTrades = await db.findOpenTradesByUserId(interaction.user.id);
    
    if (openTrades.length === 0) {
      return interaction.reply({ content: 'You have no open trades to sell!', ephemeral: true });
    }

    // Create select menu for open trades
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('trade_sell_select')
      .setPlaceholder('Select a trade to sell')
      .addOptions(
        openTrades.map(trade => {
          const expirationDate = new Date(trade.expiration).toLocaleDateString();
          const price = `$${trade.buyPrice}`;
          const quantity = trade.buyQuantity - trade.soldQuantity;
          
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${trade.stock} ${trade.contract}`)
            .setDescription(`Exp: ${expirationDate} | Price: ${price} | Qty: ${quantity}`)
            .setValue(trade._id || '');
        })
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    await interaction.reply({
      content: 'Select a trade to record a sell:',
      components: [selectRow],
      ephemeral: true,
    });
  } else if (subcommand === 'list') {
    // List user's open trades
    const openTrades = await db.findOpenTradesByUserId(interaction.user.id);
    
    if (openTrades.length === 0) {
      return interaction.reply({ content: 'You have no open trades!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('Your Open Trades')
      .setColor('#00ff00')
      .setDescription('Here are your currently open trades:')
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();

    openTrades.forEach((trade, index) => {
      const boughtDate = new Date(trade.createdAt).toLocaleDateString();
      const expirationDate = new Date(trade.expiration).toLocaleDateString();
      
      embed.addFields({
        name: `${index + 1}. ${trade.stock} - ${trade.contract}`,
        value: `Bought: ${boughtDate} at $${trade.buyPrice}\n` +
              `Expiration: ${expirationDate}\n` +
              `Quantity: ${trade.buyQuantity - trade.soldQuantity}/${trade.buyQuantity}\n` +
              `Notes: ${trade.notes || 'None'}`
      });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// Handle interactions (modal submissions, button clicks, select menu)
export async function handleInteraction(interaction: ModalSubmitInteraction | ButtonInteraction | StringSelectMenuInteraction) {
  if (interaction.isModalSubmit() && interaction.customId === 'trade_add_modal') {
    // Handle add trade modal submission
    const stock = interaction.fields.getTextInputValue('stock');
    const contractAndExpiration = interaction.fields.getTextInputValue('contract_expiration');
    const price = parseFloat(interaction.fields.getTextInputValue('price'));
    const quantity = parseInt(interaction.fields.getTextInputValue('quantity'));
    const notes = interaction.fields.getTextInputValue('notes') || '';

    // Parse contract and expiration
    let contract: string, expiration: string;
    try {
      const parts = contractAndExpiration.trim().split(/\s+/);
      if (parts.length < 2) {
        return interaction.reply({
          content: 'Invalid format for contract & expiration. Please use format: "CALL $150 05/17" or "150C 05/17"',
          ephemeral: true
        });
      }
      
      // Extract the expiration (last part)
      expiration = parts.pop() || '';
      
      // Parse the contract part
      let contractPart = parts.join(' ').toUpperCase();
      
      // Handle shorthand notation (e.g., 150C or 150P)
      const shorthandMatch = contractPart.match(/^(\d+)(C|P)$/i);
      if (shorthandMatch) {
        const [_, strike, type] = shorthandMatch;
        contractPart = `${type === 'C' ? 'CALL' : 'PUT'} $${strike}`;
      }
      
      // If it doesn't start with CALL or PUT, try to parse it
      if (!contractPart.startsWith('CALL') && !contractPart.startsWith('PUT')) {
        // Check if it has a dollar sign
        if (contractPart.includes('$')) {
          const [type, strike] = contractPart.split('$');
          if (type.trim() === 'C') contractPart = `CALL $${strike}`;
          if (type.trim() === 'P') contractPart = `PUT $${strike}`;
        }
      }
      
      contract = contractPart;
      
      console.log(`Parsed contract: "${contract}", expiration: "${expiration}"`);
    } catch (error) {
      return interaction.reply({
        content: 'Failed to parse contract & expiration. Please use format: "CALL $150 05/17" or "150C 05/17"',
        ephemeral: true
      });
    }

    // Validate expiration date format with new parser
    let expirationDate: Date;
    try {
      expirationDate = parseExpirationDate(expiration);
      
      // Validate that the date is not in the past
      if (expirationDate < new Date(new Date().setHours(0, 0, 0, 0))) {
        return interaction.reply({ 
          content: 'Expiration date cannot be in the past.', 
          ephemeral: true 
        });
      }
    } catch (error) {
      return interaction.reply({ 
        content: 'Invalid date format. Please use MM/DD/YY, MM/DD, or 0DTE for same-day expiration.', 
        ephemeral: true 
      });
    }

    // Create new trade
    const trade = createTrade(
      interaction.user.id,
      stock,
      contract,
      expirationDate,
      price,
      quantity,
      notes
    );

    // Check if an identical open trade exists (same stock, contract, and expiration)
    console.log(`Looking for identical trade: ${stock}:${contract}:${expirationDate.toISOString()}`);
    const existingTrade = await db.findIdenticalOpenTrade(
      interaction.user.id,
      stock.toUpperCase().trim(),
      contract.trim(),
      expirationDate.toISOString()
    );
    
    console.log(`Existing trade found: ${existingTrade ? 'Yes' : 'No'}`);
    if (existingTrade) {
      console.log(`Existing trade details: ${existingTrade._id} - ${existingTrade.stock} ${existingTrade.contract} (${existingTrade.buyQuantity})`);
    }

    let result;
    let finalTrade;
    let newBuyPrice;
    
    if (existingTrade) {
      // Calculate weighted average price
      const totalCost = (existingTrade.buyPrice * existingTrade.buyQuantity) + (price * quantity);
      const totalQuantity = existingTrade.buyQuantity + quantity;
      newBuyPrice = totalCost / totalQuantity;
      
      // Update existing trade
      finalTrade = {
        ...existingTrade,
        buyPrice: newBuyPrice,
        buyQuantity: totalQuantity,
        notes: notes || existingTrade.notes,
        updatedAt: new Date().toISOString()
      };
      
      result = await db.updateTrade(finalTrade);
    } else {
      // Insert new trade
      result = await db.insertTrade(trade);
      finalTrade = trade;
      newBuyPrice = price;
    }

    // Create embedded message
    const embed = new EmbedBuilder()
      .setTitle(existingTrade ? '📊 Position Averaged – BUY' : '📢 New Trade Alert – BUY')
      .setColor('#32CD32') // Always green for buys
      .addFields(
        { name: 'Stock', value: stock, inline: false },
        { name: 'Option', value: `${contract} | Exp. ${expirationDate.toLocaleDateString()}`, inline: false },
        { name: 'Buy Price', value: existingTrade ? 
          `New: $${price.toFixed(2)} → Avg: $${newBuyPrice.toFixed(2)} (from $${existingTrade.buyPrice.toFixed(2)})` : 
          `$${price}`, inline: false },
        { name: 'Quantity', value: existingTrade ? 
          `+${quantity} (Total: ${finalTrade.buyQuantity})` : 
          quantity.toString(), inline: false }
      )
      .setTimestamp();

    // Get today's trading stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysTrades = await db.findTodaysTrades(interaction.user.id, today.toISOString());
    const stats = calculateDailyStats(todaysTrades);
    
    // Add quick stats field
    embed.addFields({
      name: '📈 Today\'s Quick Stats',
      value: `Trades: ${stats.totalTrades}${stats.winningTrades + stats.losingTrades > 0 ? 
        ` (${stats.winningTrades}W/${stats.losingTrades}L)` : 
        ' (0W/0L)'}\n` +
             `Win Rate: ${stats.winRate}%\n` +
             `P/L: ${stats.totalPL >= 0 ? '+' : ''}$${stats.totalPL.toFixed(2)}`,
      inline: false
    });
      
    // Add notes field only if notes are provided
    if (notes) {
      embed.addFields({ name: 'Notes', value: notes, inline: false });
    }
    
    // Add position status field if this is an update to an existing position
    if (existingTrade) {
      embed.addFields({ 
        name: 'Position Update', 
        value: `Added ${quantity} contracts to ${stock} position.\nTotal Position: ${finalTrade.buyQuantity} contracts @ $${newBuyPrice.toFixed(2)} avg`,
        inline: false 
      });
    }
    
    embed.setFooter({ text: '⚠️ Not Financial Advice. Always size positions appropriately and set your own stop losses.' });

    // Send trade announcement to channel
    const tradeChannelId = process.env.TRADE_CHANNEL_ID;
    const alertRoleId = process.env.ALERT_ROLE_ID;
    
    if (tradeChannelId) {
      try {
        const channel = interaction.client.channels.cache.get(tradeChannelId);
        if (channel instanceof TextChannel) {
          await channel.send({
            content: alertRoleId ? `<@&${alertRoleId}>` : '',
            embeds: [embed]
          });
        }
      } catch (error) {
        console.error('Failed to send announcement to trade channel:', error);
        // Continue execution - don't let channel send failure prevent confirmation to user
      }
    }

    await interaction.reply({ content: 'Trade added successfully!', ephemeral: true });
  } else if (interaction.isStringSelectMenu() && interaction.customId === 'trade_sell_select') {
    // Handle trade selection for selling
    const tradeId = interaction.values[0];
    const trade = await db.getTradeById(tradeId);
    
    if (!trade) {
      return interaction.reply({ content: 'Trade not found!', ephemeral: true });
    }

    // Create a button to show the sell modal
    const button = new ButtonBuilder()
      .setCustomId(`trade_sell_button_${tradeId}`)
      .setLabel('Enter Sell Details')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(button);

    await interaction.update({
      content: `Selected trade: ${trade.stock} ${trade.contract}\nClick the button below to enter sell details:`,
      components: [row],
    });
  } else if (interaction.isButton() && interaction.customId.startsWith('trade_sell_button_')) {
    // Handle button click to show sell modal
    const tradeId = interaction.customId.split('_')[3];
    const trade = await db.getTradeById(tradeId);
    
    if (!trade) {
      return interaction.reply({ content: 'Trade not found!', ephemeral: true });
    }

    // Create modal for selling a trade
    const modal = new ModalBuilder()
      .setCustomId(`trade_sell_modal_${tradeId}`)
      .setTitle(`Sell ${trade.stock} ${trade.contract}`);

    // Calculate remaining quantity
    const remainingQuantity = trade.buyQuantity - trade.soldQuantity;

    // Add form inputs
    const priceInput = new TextInputBuilder()
      .setCustomId('sell_price')
      .setLabel('Sell Price per Contract')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const quantityInput = new TextInputBuilder()
      .setCustomId('sell_quantity')
      .setLabel(`Quantity (max: ${remainingQuantity})`)
      .setStyle(TextInputStyle.Short)
      .setValue(remainingQuantity.toString())
      .setRequired(true);
      
    const notesInput = new TextInputBuilder()
      .setCustomId('sell_notes')
      .setLabel('Notes (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    // Add inputs to rows
    const firstRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(priceInput);
    const secondRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(quantityInput);
    const thirdRow = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(notesInput);

    // Add rows to modal
    modal.addComponents(firstRow, secondRow, thirdRow);

    // Show modal to user
    await interaction.showModal(modal);
  } else if (interaction.isModalSubmit() && interaction.customId.startsWith('trade_sell_modal_')) {
    // Handle sell trade modal submission
    const tradeId = interaction.customId.split('_')[3];
    const trade = await db.getTradeById(tradeId);
    
    if (!trade) {
      return interaction.reply({ content: 'Trade not found!', ephemeral: true });
    }

    const sellPrice = parseFloat(interaction.fields.getTextInputValue('sell_price'));
    const sellQuantity = parseInt(interaction.fields.getTextInputValue('sell_quantity'));
    const sellNotes = interaction.fields.getTextInputValue('sell_notes') || '';

    // Validate sell quantity
    const remainingQuantity = trade.buyQuantity - trade.soldQuantity;
    if (sellQuantity > remainingQuantity) {
      return interaction.reply({ 
        content: `You can't sell more than the remaining quantity (${remainingQuantity})!`, 
        ephemeral: true 
      });
    }

    // Get OpenAI analysis
    let aiAnalysis = '';
    try {
      aiAnalysis = await analyzeTrade(trade, sellPrice, sellQuantity);
    } catch (error) {
      console.error('Failed to get AI analysis:', error);
      aiAnalysis = 'AI analysis unavailable.';
    }

    // Update trade with sell information
    const updatedTrade = updateTradeOnSell(trade, sellPrice, sellQuantity);
    updatedTrade.notes = sellNotes; // Add sell notes
    await db.updateTrade(updatedTrade);

    // Calculate profit/loss
    const boughtAmount = trade.buyPrice * sellQuantity * 100; // Multiply by 100 for contract value
    const soldAmount = sellPrice * sellQuantity * 100; // Multiply by 100 for contract value
    const profitLoss = soldAmount - boughtAmount;
    const profitLossPercentage = ((profitLoss / boughtAmount) * 100).toFixed(2);

    // Create embedded message
    const embed = new EmbedBuilder()
      .setTitle('📢 New Trade Alert – SELL')
      .setColor('#FF0000') // Always red for sells
      .addFields(
        { name: 'Stock', value: trade.stock, inline: false },
        { name: 'Option', value: `${trade.contract} | Exp. ${new Date(trade.expiration).toLocaleDateString()}`, inline: false },
        { name: 'Buy Price', value: `$${trade.buyPrice}`, inline: false },
        { name: 'Sell Price', value: `$${sellPrice}`, inline: false },
        { name: 'Quantity', value: sellQuantity === trade.buyQuantity 
                                   ? sellQuantity.toString() 
                                   : `${sellQuantity} of ${trade.buyQuantity} (${(sellQuantity/trade.buyQuantity*100).toFixed(0)}%)`, 
          inline: false },
        { name: 'Profit/Loss', value: `$${profitLoss.toFixed(2)} (${profitLoss >= 0 ? '+' : ''}${profitLossPercentage}%)`, inline: false }
      )
      .setTimestamp();
      
    // Add notes field only if notes are provided
    if (sellNotes) {
      embed.addFields({ name: 'Notes', value: sellNotes, inline: false });
    }
    
    // Add status field
    const remainingAfterSell = trade.buyQuantity - updatedTrade.soldQuantity;
    embed.addFields({
      name: 'Status', 
      value: updatedTrade.isOpen 
             ? `PARTIAL SELL - ${remainingAfterSell} contract${remainingAfterSell > 1 ? 's' : ''} remaining` 
             : 'CLOSED - Position fully exited',
      inline: false 
    });
    
    embed.setFooter({ text: `Trade ID: ${trade._id}` });

    // Send trade sell announcement to channel
    const tradeChannelId = process.env.TRADE_CHANNEL_ID;
    const alertRoleId = process.env.ALERT_ROLE_ID;
    
    if (tradeChannelId) {
      try {
        const channel = interaction.client.channels.cache.get(tradeChannelId);
        if (channel instanceof TextChannel) {
          await channel.send({ 
            content: alertRoleId ? `<@&${alertRoleId}>` : '',
            embeds: [embed] 
          });
        }
      } catch (error) {
        console.error('Failed to send sell announcement to trade channel:', error);
        // Continue execution
      }
    }

    await interaction.reply({ content: 'Trade sell recorded successfully!', ephemeral: true });
  }
}

interface SellPrice {
  price: number;
  quantity: number;
  date: string;
}

// Calculate daily trading statistics
interface DailyStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPL: number;
}

function calculateDailyStats(trades: ITrade[]): DailyStats {
  const stats: DailyStats = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalPL: 0
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Process each trade
  trades.forEach(trade => {
    const tradeDate = new Date(trade.createdAt); // Changed from updatedAt to createdAt
    tradeDate.setHours(0, 0, 0, 0);
    const isToday = tradeDate.getTime() === today.getTime();

    // Count buys made today - simplified condition
    if (isToday) {
      stats.totalTrades++;
      console.log(`Counting buy trade for ${trade.stock} ${trade.contract}`); // Debug log
    }

    // Process sells made today
    if (trade.sellPrices.length > 0) {
      const todaySells = trade.sellPrices.filter(sell => {
        const sellDate = new Date(sell.date);
        sellDate.setHours(0, 0, 0, 0);
        return sellDate.getTime() === today.getTime();
      });

      if (todaySells.length > 0) {
        stats.totalTrades++;
        
        // Calculate P/L for all sells today
        let tradePL = 0;
        todaySells.forEach((sell: SellPrice) => {
          const buyAmount = trade.buyPrice * sell.quantity * 100; // Multiply by 100 for contract value
          const sellAmount = sell.price * sell.quantity * 100;
          tradePL += sellAmount - buyAmount;
        });

        if (tradePL >= 0) {
          stats.winningTrades++;
        } else {
          stats.losingTrades++;
        }

        stats.totalPL += tradePL;
      }
    }
  });

  // Calculate win rate (only based on closed trades)
  const closedTrades = stats.winningTrades + stats.losingTrades;
  stats.winRate = closedTrades > 0 
    ? Math.round((stats.winningTrades / closedTrades) * 100) 
    : 0;

  return stats;
}

// Helper function to parse expiration date
function parseExpirationDate(dateStr: string): Date {
  // Handle 0DTE case
  if (dateStr.toLowerCase() === '0dte') {
    return new Date();
  }

  // Try MM/DD/YY format first
  const fullDateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateStr);
  if (fullDateMatch) {
    const [_, month, day, year] = fullDateMatch;
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }

  // Try MM/DD format (assume current year)
  const shortDateMatch = /^(\d{1,2})\/(\d{1,2})$/.exec(dateStr);
  if (shortDateMatch) {
    const [_, month, day] = shortDateMatch;
    const currentYear = new Date().getFullYear();
    return new Date(`${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }

  throw new Error('Invalid date format. Please use MM/DD/YY, MM/DD, or 0DTE');
} 