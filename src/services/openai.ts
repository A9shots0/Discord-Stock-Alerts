import OpenAI from 'openai';
import { ITrade } from '../models/Trade';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function analyzeTrade(trade: ITrade, sellPrice: number, sellQuantity: number): Promise<string> {
  const boughtAmount = trade.buyPrice * sellQuantity;
  const soldAmount = sellPrice * sellQuantity;
  const profitLoss = soldAmount - boughtAmount;
  const profitLossPercentage = ((profitLoss / boughtAmount) * 100).toFixed(2);
  const isProfitable = profitLoss >= 0;
  
  const prompt = `Analyze this stock option trade:
Stock: ${trade.stock}
Contract: ${trade.contract}
Buy Price: $${trade.buyPrice}
Sell Price: $${sellPrice}
Quantity: ${sellQuantity}
Profit/Loss: ${isProfitable ? '+' : ''}$${profitLoss.toFixed(2)} (${profitLossPercentage}%)

Provide a brief, one-sentence analysis of this trade focusing on the performance and any notable aspects.`;

  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    max_tokens: 100,
    temperature: 0.7
  });

  return response.choices[0].message.content || 'No analysis available.';
} 