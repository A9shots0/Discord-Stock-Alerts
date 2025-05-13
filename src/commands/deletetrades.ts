import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalSubmitInteraction,
  ButtonInteraction,
  ModalActionRowComponentBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} from 'discord.js';

import * as db from '../services/database';

// Command data
export const data = new SlashCommandBuilder()
  .setName('deletetrades')
  .setDescription('Delete your trades')
  .addSubcommand(subcommand =>
    subcommand
      .setName('all')
      .setDescription('Delete all your trades (use with caution)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('one')
      .setDescription('Delete a specific trade')
  );

// Execute the command
export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'all') {
    // Create confirmation button for deleting all trades
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('deletetrades_confirm_all')
          .setLabel('Yes, delete ALL my trades')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('deletetrades_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      );

    await interaction.reply({
      content: '⚠️ **WARNING:** This will delete ALL of your trades. This action cannot be undone. Are you sure you want to continue?',
      components: [row],
      ephemeral: true,
    });
  } else if (subcommand === 'one') {
    // Get user's trades
    const trades = await db.findTradesByUserId(interaction.user.id);
    
    if (trades.length === 0) {
      return interaction.reply({ content: 'You have no trades to delete!', ephemeral: true });
    }

    // Create select menu for trades
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('deletetrades_select')
      .setPlaceholder('Select a trade to delete')
      .addOptions(
        trades.map(trade => {
          const expirationDate = new Date(trade.expiration).toLocaleDateString();
          const isOpen = trade.isOpen ? 'OPEN' : 'CLOSED';
          const status = trade.isOpen ? 
            `${trade.buyQuantity - trade.soldQuantity}/${trade.buyQuantity} remaining` : 
            'Fully sold';
          
          return new StringSelectMenuOptionBuilder()
            .setLabel(`${trade.stock} ${trade.contract}`)
            .setDescription(`${isOpen} | Exp: ${expirationDate} | ${status}`)
            .setValue(trade._id || '');
        })
      );

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);

    await interaction.reply({
      content: 'Select a trade to delete:',
      components: [selectRow],
      ephemeral: true,
    });
  }
}

// Handle interactions (button clicks, select menu)
export async function handleInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  if (interaction.isButton() && interaction.customId === 'deletetrades_confirm_all') {
    try {
      const result = await db.deleteAllTradesForUser(interaction.user.id);
      
      await interaction.update({
        content: `Successfully deleted ${result.deleted} trades${result.failed > 0 ? ` (${result.failed} failed)` : ''}.`,
        components: [],
      });
    } catch (error) {
      console.error('Error deleting all trades:', error);
      await interaction.update({
        content: 'Failed to delete trades. Please try again later.',
        components: [],
      });
    }
  } else if (interaction.isButton() && interaction.customId === 'deletetrades_cancel') {
    await interaction.update({
      content: 'Trade deletion cancelled.',
      components: [],
    });
  } else if (interaction.isStringSelectMenu() && interaction.customId === 'deletetrades_select') {
    const tradeId = interaction.values[0];
    const trade = await db.getTradeById(tradeId);
    
    if (!trade) {
      return interaction.update({ 
        content: 'Trade not found!', 
        components: [] 
      });
    }

    // Format trade details for confirmation
    const expirationDate = new Date(trade.expiration).toLocaleDateString();
    const status = trade.isOpen ? 
      `OPEN (${trade.buyQuantity - trade.soldQuantity}/${trade.buyQuantity} remaining)` : 
      'CLOSED (fully sold)';
    
    const embed = new EmbedBuilder()
      .setTitle('Confirm Trade Deletion')
      .setColor('#FF0000')
      .addFields(
        { name: 'Stock', value: trade.stock, inline: true },
        { name: 'Contract', value: trade.contract, inline: true },
        { name: 'Expiration', value: expirationDate, inline: true },
        { name: 'Buy Price', value: `$${trade.buyPrice}`, inline: true },
        { name: 'Buy Quantity', value: trade.buyQuantity.toString(), inline: true },
        { name: 'Status', value: status, inline: true }
      );

    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`deletetrades_confirm_one_${tradeId}`)
          .setLabel('Delete this trade')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('deletetrades_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      );

    await interaction.update({
      content: '⚠️ Are you sure you want to delete this trade?',
      embeds: [embed],
      components: [row],
    });
  } else if (interaction.isButton() && interaction.customId.startsWith('deletetrades_confirm_one_')) {
    const tradeId = interaction.customId.split('_')[3];
    const trade = await db.getTradeById(tradeId);
    
    if (!trade || !trade._rev) {
      return interaction.update({ 
        content: 'Trade not found or missing required data!', 
        components: [],
        embeds: []
      });
    }

    try {
      await db.deleteTrade(tradeId, trade._rev);
      
      await interaction.update({
        content: `Successfully deleted trade: ${trade.stock} ${trade.contract}`,
        components: [],
        embeds: []
      });
    } catch (error) {
      console.error(`Error deleting trade ${tradeId}:`, error);
      await interaction.update({
        content: 'Failed to delete trade. Please try again later.',
        components: [],
        embeds: []
      });
    }
  }
} 