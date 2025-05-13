import { DocumentScope } from 'nano';

// Interface for Trade document
export interface ITrade {
  _id?: string;
  _rev?: string;
  type: 'trade';
  userId: string;
  stock: string;
  contract: string;
  expiration: string; // ISO date string
  buyPrice: number;
  buyQuantity: number;
  soldQuantity: number;
  sellPrices: Array<{
    price: number;
    quantity: number;
    date: string; // ISO date string
  }>;
  notes: string;
  isOpen: boolean;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

// Views for CouchDB
export const views = {
  design: 'trades',
  views: {
    openTradesByUserId: {
      map: `function(doc) {
        if (doc.type === 'trade' && doc.isOpen) {
          emit(doc.userId, null);
        }
      }`
    },
    tradesByUserId: {
      map: `function(doc) {
        if (doc.type === 'trade') {
          emit(doc.userId, null);
        }
      }`
    },
    identicalOpenTradesByKey: {
      map: `function(doc) {
        if (doc.type === 'trade' && doc.isOpen) {
          emit([doc.userId, doc.stock, doc.contract, doc.expiration], null);
        }
      }`
    },
    tradesByDate: {
      map: `function(doc) {
        if (doc.type === 'trade') {
          var date = doc.updatedAt.split('T')[0];
          emit([doc.userId, date], null);
        }
      }`
    }
  }
};

// Helper function to create a new trade
export function createTrade(
  userId: string,
  stock: string,
  contract: string,
  expiration: Date,
  buyPrice: number,
  buyQuantity: number,
  notes: string = '',
): ITrade {
  const now = new Date().toISOString();
  
  return {
    type: 'trade',
    userId,
    stock: stock.toUpperCase(),
    contract,
    expiration: expiration.toISOString(),
    buyPrice,
    buyQuantity,
    soldQuantity: 0,
    sellPrices: [],
    notes,
    isOpen: true,
    createdAt: now,
    updatedAt: now,
  };
}

// Helper function to update a trade when selling
export function updateTradeOnSell(
  trade: ITrade,
  sellPrice: number,
  sellQuantity: number
): ITrade {
  const updatedTrade = { ...trade };
  
  updatedTrade.soldQuantity += sellQuantity;
  updatedTrade.sellPrices.push({
    price: sellPrice,
    quantity: sellQuantity,
    date: new Date().toISOString()
  });
  
  // Check if trade should be closed
  if (updatedTrade.soldQuantity >= updatedTrade.buyQuantity) {
    updatedTrade.isOpen = false;
  }
  
  updatedTrade.updatedAt = new Date().toISOString();
  
  return updatedTrade;
} 