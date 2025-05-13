import nano, { DocumentScope, MaybeDocument, DocumentInsertResponse, ViewDocument } from 'nano';
import { ITrade, views } from '../models/Trade';

// Database namespace
let db: DocumentScope<ITrade>;

// Helper function to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Initialize database connection with retries
export async function initDatabase(couchdbUrl: string): Promise<void> {
  const maxRetries = 5;
  const retryDelay = 5000; // 5 seconds
  let retries = 0;

  while (retries < maxRetries) {
    try {
      // Connect to CouchDB server
      const couch = nano(couchdbUrl);
      const dbName = 'trades';

      // Create system databases first
      try {
        await couch.db.create('_users');
        console.log('Created _users database');
      } catch (error) {
        // Ignore if already exists
      }

      try {
        // Try to get the database to check if it exists
        await couch.db.get(dbName);
        console.log(`Database ${dbName} already exists`);
      } catch (error) {
        // Create database if it doesn't exist
        console.log(`Creating database ${dbName}...`);
        await couch.db.create(dbName);
      }

      // Connect to database
      db = couch.use<ITrade>(dbName);

      // Create design document with views
      try {
        const designDoc = await db.get('_design/' + views.design) as unknown as ViewDocument<ITrade> & { _rev?: string };
        console.log('Design document already exists');

        // Update views if they have changed
        if (JSON.stringify(designDoc.views) !== JSON.stringify(views.views)) {
          console.log('Updating views...');
          await db.insert({
            _id: '_design/' + views.design,
            _rev: designDoc._rev,
            views: views.views
          });
        }
      } catch (error) {
        // Create design document if it doesn't exist
        console.log('Creating design document...');
        await db.insert({
          _id: '_design/' + views.design,
          views: views.views
        });
      }

      console.log('Successfully connected to CouchDB');
      return;
    } catch (error) {
      retries++;
      console.log(`CouchDB connection attempt ${retries} failed: ${error}`);
      if (retries < maxRetries) {
        console.log(`Retrying in ${retryDelay/1000} seconds...`);
        await wait(retryDelay);
      } else {
        throw new Error(`Failed to connect to CouchDB after ${maxRetries} attempts`);
      }
    }
  }
}

// Find all trades by user ID
export async function findTradesByUserId(userId: string): Promise<ITrade[]> {
  const result = await db.view(views.design, 'tradesByUserId', { key: userId, include_docs: true });
  return result.rows.map(row => row.doc as ITrade);
}

// Find open trades by user ID
export async function findOpenTradesByUserId(userId: string): Promise<ITrade[]> {
  const result = await db.view(views.design, 'openTradesByUserId', { key: userId, include_docs: true });
  return result.rows.map(row => row.doc as ITrade);
}

// Find identical open trade (same stock, contract, and expiration)
export async function findIdenticalOpenTrade(
  userId: string, 
  stock: string, 
  contract: string, 
  expiration: string
): Promise<ITrade | null> {
  try {
    // Normalize inputs for consistency
    const normalizedStock = stock.toUpperCase().trim();
    const normalizedContract = contract.trim();
    
    // Log the search criteria
    console.log(`Looking for identical trade: ${normalizedStock} | ${normalizedContract} | exp:${expiration}`);
    
    // Get all open trades for the user
    const openTrades = await findOpenTradesByUserId(userId);
    console.log(`Found ${openTrades.length} open trades`);
    
    // Helper function to normalize date to date-only (no time component)
    const normalizeDate = (dateStr: string): string => {
      const date = new Date(dateStr);
      return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    };
    
    // Normalize the search expiration date
    const normalizedExpiration = normalizeDate(expiration);
    
    // For debugging, log each open trade's details
    for (const trade of openTrades) {
      const tradeStock = trade.stock.toUpperCase().trim();
      const tradeContract = trade.contract.trim();
      const tradeExpiration = normalizeDate(trade.expiration);
      
      console.log(`Comparing with: ${tradeStock} | ${tradeContract} | ${trade.expiration}`);
      console.log(`Stock match: ${tradeStock === normalizedStock}, Contract match: ${tradeContract === normalizedContract}`);
      console.log(`Expiration match: ${tradeExpiration === normalizedExpiration} (${normalizedExpiration} vs ${tradeExpiration})`);
    }
    
    // Find a matching trade using normalized comparison
    const identicalTrade = openTrades.find(trade => {
      const tradeStock = trade.stock.toUpperCase().trim();
      const tradeContract = trade.contract.trim();
      
      // Compare dates using only year, month, day (ignore time)
      const tradeExpiration = normalizeDate(trade.expiration);
      
      const matches = 
        tradeStock === normalizedStock && 
        tradeContract === normalizedContract && 
        tradeExpiration === normalizedExpiration;
      
      if (matches) {
        console.log(`Found matching trade: ${trade._id} - ${trade.stock} ${trade.contract}`);
      }
      
      return matches;
    });
    
    return identicalTrade || null;
  } catch (error) {
    console.error('Error finding identical trade:', error);
    return null;
  }
}

// Get trade by ID
export async function getTradeById(id: string): Promise<ITrade | null> {
  try {
    return await db.get(id);
  } catch (error) {
    return null;
  }
}

// Insert a new trade
export async function insertTrade(trade: ITrade): Promise<DocumentInsertResponse> {
  return await db.insert(trade);
}

// Update an existing trade
export async function updateTrade(trade: ITrade): Promise<DocumentInsertResponse> {
  return await db.insert(trade);
}

// Delete a trade by ID
export async function deleteTrade(id: string, rev: string): Promise<DocumentInsertResponse> {
  try {
    return await db.destroy(id, rev);
  } catch (error) {
    console.error(`Error deleting trade ${id}:`, error);
    throw error;
  }
}

// Delete all trades for a user
export async function deleteAllTradesForUser(userId: string): Promise<{deleted: number, failed: number}> {
  try {
    const trades = await findTradesByUserId(userId);
    console.log(`Found ${trades.length} trades to delete for user ${userId}`);
    
    let deleted = 0;
    let failed = 0;
    
    for (const trade of trades) {
      if (trade._id && trade._rev) {
        try {
          await db.destroy(trade._id, trade._rev);
          deleted++;
          console.log(`Deleted trade ${trade._id} (${trade.stock} ${trade.contract})`);
        } catch (error) {
          failed++;
          console.error(`Failed to delete trade ${trade._id}:`, error);
        }
      } else {
        failed++;
        console.error(`Trade missing _id or _rev: ${JSON.stringify(trade)}`);
      }
    }
    
    return { deleted, failed };
  } catch (error) {
    console.error(`Error deleting trades for user ${userId}:`, error);
    throw error;
  }
}

// Find trades for today
export async function findTodaysTrades(userId: string, todayDate: string): Promise<ITrade[]> {
  try {
    const result = await db.view(views.design, 'tradesByDate', {
      startkey: [userId, todayDate],
      endkey: [userId, todayDate + '\ufff0'],
      include_docs: true
    });
    return result.rows.map(row => row.doc as ITrade);
  } catch (error) {
    console.error('Error finding today\'s trades:', error);
    return [];
  }
}

export default {
  initDatabase,
  findTradesByUserId,
  findOpenTradesByUserId,
  findIdenticalOpenTrade,
  getTradeById,
  insertTrade,
  updateTrade,
  deleteTrade,
  deleteAllTradesForUser,
  findTodaysTrades
}; 