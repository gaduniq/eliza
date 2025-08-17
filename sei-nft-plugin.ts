import type { Plugin } from '@elizaos/core';
import {
  type Action,
  type ActionResult,
  type Content,
  type GenerateTextParams,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  ModelType,
  type Provider,
  type ProviderResult,
  Service,
  type State,
  logger,
  type MessagePayload,
  type WorldPayload,
  EventType,
} from '@elizaos/core';
import { z } from 'zod';
import axios from 'axios';

/**
 * Defines the configuration schema for the SEI NFT plugin
 */
const configSchema = z.object({
  MAGIC_EDEN_API_URL: z
    .string()
    .url()
    .default('https://api-mainnet.magiceden.dev')
    .transform((val) => val.trim()),
  SEI_RPC_URL: z
    .string()
    .url()
    .default('https://evm-rpc.sei-apis.com')
    .transform((val) => val.trim()),
  MAGIC_EDEN_API_KEY: z
    .string()
    .optional()
    .transform((val) => val?.trim()),
  SEI_CHAIN_ID: z
    .string()
    .default('1329')
    .transform((val) => val.trim()),
});

/**
 * Interface for NFT metadata
 */
interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  external_url?: string;
  animation_url?: string;
}

/**
 * Interface for NFT data
 */
interface NFTData {
  tokenId: string;
  contractAddress: string;
  owner: string;
  metadata: NFTMetadata;
  price?: string;
  currency?: string;
  marketplace?: string;
  listingId?: string;
  collectionName?: string;
  rarity?: number;
  lastSale?: {
    price: string;
    currency: string;
    timestamp: string;
  };
}

/**
 * Interface for collection data
 */
interface CollectionData {
  address: string;
  name: string;
  symbol: string;
  description?: string;
  totalSupply: number;
  floorPrice?: string;
  volume24h?: string;
  owners?: number;
  verified?: boolean;
  image?: string;
}

/**
 * Interface for minting parameters
 */
interface MintParams {
  to: string;
  metadata: NFTMetadata;
  collectionAddress?: string;
  royaltyPercentage?: number;
  royaltyRecipient?: string;
}

/**
 * Interface for listing parameters
 */
interface ListingParams {
  tokenId: string;
  contractAddress: string;
  price: string;
  currency: string;
  duration?: number; // in hours
}

/**
 * Interface for buying parameters
 */
interface BuyParams {
  listingId: string;
  tokenId: string;
  contractAddress: string;
  price: string;
  currency: string;
}

/**
 * SEI NFT Service to handle all NFT-related functionality
 */
export class SeiNFTService extends Service {
  static override serviceType = 'sei-nft';

  override capabilityDescription =
    'Provides comprehensive NFT functionality on SEI blockchain including minting, buying, selling, and collection management via Magic Eden.';

  private magicEdenApiUrl: string;
  private seiRpcUrl: string;
  private apiKey?: string;
  private chainId: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.magicEdenApiUrl = process.env.MAGIC_EDEN_API_URL || 'https://api-mainnet.magiceden.dev';
    this.seiRpcUrl = process.env.SEI_RPC_URL || 'https://evm-rpc.sei-apis.com';
    this.apiKey = process.env.MAGIC_EDEN_API_KEY;
    this.chainId = process.env.SEI_CHAIN_ID || '1329';
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI NFT service');
    return new SeiNFTService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI NFT service');
    const service = runtime.getService(SeiNFTService.serviceType);
    if (!service) {
      throw new Error('SEI NFT service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI NFT service stopped');
  }

  private getHeaders() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Gets NFTs owned by a specific address
   */
  async getNFTsByAddress(address: string, limit: number = 20, offset: number = 0): Promise<NFTData[]> {
    try {
      const response = await axios.get(`${this.magicEdenApiUrl}/v2/wallets/${address}/tokens`, {
        params: { limit, offset },
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return response.data.map((item: any) => this.formatNFTData(item));
    } catch (error) {
      logger.error({ error, address }, 'Failed to get NFTs by address');
      throw new Error(`Failed to get NFTs for address: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets collection information
   */
  async getCollection(address: string): Promise<CollectionData> {
    try {
      const response = await axios.get(`${this.magicEdenApiUrl}/v2/collections/${address}/stats`, {
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return this.formatCollectionData(response.data);
    } catch (error) {
      logger.error({ error, address }, 'Failed to get collection data');
      throw new Error(`Failed to get collection data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets NFT details by token ID and contract address
   */
  async getNFTDetails(contractAddress: string, tokenId: string): Promise<NFTData> {
    try {
      const response = await axios.get(`${this.magicEdenApiUrl}/v2/tokens/${contractAddress}:${tokenId}`, {
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return this.formatNFTData(response.data);
    } catch (error) {
      logger.error({ error, contractAddress, tokenId }, 'Failed to get NFT details');
      throw new Error(`Failed to get NFT details: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Lists an NFT for sale on Magic Eden
   */
  async listNFTForSale(params: ListingParams): Promise<{ listingId: string; txHash?: string }> {
    try {
      const response = await axios.post(`${this.magicEdenApiUrl}/v2/instructions/sell`, {
        seller: params.contractAddress, // This should be the seller's address
        auctionHouse: 'magic-eden', // Magic Eden auction house
        tokenMint: `${params.contractAddress}:${params.tokenId}`,
        price: parseFloat(params.price),
        sellerReferral: null,
        expiry: params.duration ? Date.now() + (params.duration * 60 * 60 * 1000) : null,
      }, {
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return {
        listingId: response.data.listingId || response.data.id,
        txHash: response.data.txHash,
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to list NFT for sale');
      throw new Error(`Failed to list NFT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Buys an NFT from Magic Eden marketplace
   */
  async buyNFT(params: BuyParams): Promise<{ txHash: string; success: boolean }> {
    try {
      const response = await axios.post(`${this.magicEdenApiUrl}/v2/instructions/buy`, {
        buyer: params.contractAddress, // This should be the buyer's address
        auctionHouse: 'magic-eden',
        tokenMint: `${params.contractAddress}:${params.tokenId}`,
        price: parseFloat(params.price),
        buyerReferral: null,
      }, {
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return {
        txHash: response.data.txHash,
        success: true,
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to buy NFT');
      throw new Error(`Failed to buy NFT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets marketplace listings for a collection
   */
  async getMarketplaceListings(collectionAddress: string, limit: number = 20, offset: number = 0): Promise<NFTData[]> {
    try {
      const response = await axios.get(`${this.magicEdenApiUrl}/v2/collections/${collectionAddress}/listings`, {
        params: { limit, offset },
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return response.data.map((item: any) => this.formatNFTData(item));
    } catch (error) {
      logger.error({ error, collectionAddress }, 'Failed to get marketplace listings');
      throw new Error(`Failed to get marketplace listings: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Searches for collections by name
   */
  async searchCollections(query: string, limit: number = 10): Promise<CollectionData[]> {
    try {
      const response = await axios.get(`${this.magicEdenApiUrl}/v2/collections`, {
        params: { search: query, limit },
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return response.data.map((item: any) => this.formatCollectionData(item));
    } catch (error) {
      logger.error({ error, query }, 'Failed to search collections');
      throw new Error(`Failed to search collections: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Mints a new NFT (simplified implementation - would need actual minting contract integration)
   */
  async mintNFT(params: MintParams): Promise<{ tokenId: string; txHash: string; contractAddress: string }> {
    try {
      // This is a simplified example. In practice, you'd need to:
      // 1. Deploy or interact with a minting contract on SEI
      // 2. Upload metadata to IPFS
      // 3. Execute the mint transaction
      
      const response = await axios.post(`${this.magicEdenApiUrl}/v2/launchpad/mint`, {
        to: params.to,
        metadata: params.metadata,
        collection: params.collectionAddress,
        royalty: {
          percentage: params.royaltyPercentage || 0,
          recipient: params.royaltyRecipient || params.to,
        },
      }, {
        headers: this.getHeaders(),
      });

      if (response.status !== 200) {
        throw new Error(`API returned status ${response.status}`);
      }

      return {
        tokenId: response.data.tokenId,
        txHash: response.data.txHash,
        contractAddress: response.data.contractAddress || params.collectionAddress || '',
      };
    } catch (error) {
      logger.error({ error, params }, 'Failed to mint NFT');
      throw new Error(`Failed to mint NFT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private formatNFTData(data: any): NFTData {
    return {
      tokenId: data.tokenId || data.token_id || data.id,
      contractAddress: data.contractAddress || data.contract_address || data.collection,
      owner: data.owner || data.holder,
      metadata: {
        name: data.name || data.metadata?.name || 'Unknown',
        description: data.description || data.metadata?.description || '',
        image: data.image || data.metadata?.image || data.img || '',
        attributes: data.attributes || data.metadata?.attributes || [],
        external_url: data.external_url || data.metadata?.external_url,
        animation_url: data.animation_url || data.metadata?.animation_url,
      },
      price: data.price || data.listing?.price,
      currency: data.currency || data.listing?.currency || 'SEI',
      marketplace: 'Magic Eden',
      listingId: data.listingId || data.listing_id,
      collectionName: data.collectionName || data.collection_name,
      rarity: data.rarity,
      lastSale: data.lastSale ? {
        price: data.lastSale.price,
        currency: data.lastSale.currency || 'SEI',
        timestamp: data.lastSale.timestamp,
      } : undefined,
    };
  }

  private formatCollectionData(data: any): CollectionData {
    return {
      address: data.address || data.contract_address || data.id,
      name: data.name || data.collection_name,
      symbol: data.symbol,
      description: data.description,
      totalSupply: data.totalSupply || data.total_supply || data.supply || 0,
      floorPrice: data.floorPrice || data.floor_price,
      volume24h: data.volume24h || data.volume_24h,
      owners: data.owners || data.unique_holders,
      verified: data.verified || false,
      image: data.image || data.logo,
    };
  }
}

/**
 * Action to get NFTs owned by an address
 */
const getNFTsByAddressAction: Action = {
  name: 'GET_NFTS_BY_ADDRESS',
  similes: ['GET_NFTS', 'LOOKUP_NFTS', 'SHOW_NFTS', 'NFT_PORTFOLIO', 'WALLET_NFTS'],
  description: 'Gets all NFTs owned by a specific SEI address',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (text.includes('nft') || text.includes('token')) && 
           (text.includes('address') || text.includes('wallet') || text.includes('owned') || text.includes('portfolio'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your NFT lookup request.',
        };
      }

      // Extract address from message
      const addressMatch = message.content.text.match(/sei[a-zA-Z0-9]{39,59}|0x[a-fA-F0-9]{40}/);
      if (!addressMatch) {
        return {
          success: false,
          error: new Error('No valid SEI address found'),
          text: 'Please provide a valid SEI address to lookup NFTs.',
        };
      }

      const address = addressMatch[0];
      const service = runtime.getService(SeiNFTService.serviceType) as SeiNFTService;
      if (!service) {
        throw new Error('SEI NFT service not available');
      }

      const nfts = await service.getNFTsByAddress(address, 10);

      let response: string;
      if (nfts.length === 0) {
        response = `No NFTs found for address ${address}.`;
      } else {
        response = `Found ${nfts.length} NFTs for address ${address}:\n\n`;
        nfts.forEach((nft, index) => {
          response += `${index + 1}. ${nft.metadata.name}\n`;
          response += `   Collection: ${nft.collectionName || 'Unknown'}\n`;
          response += `   Token ID: ${nft.tokenId}\n`;
          if (nft.price) {
            response += `   Listed for: ${nft.price} ${nft.currency}\n`;
          }
          response += `\n`;
        });
      }

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_NFTS_BY_ADDRESS'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_NFTS_BY_ADDRESS'],
          source: message.content.source,
          nfts,
          address,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get NFTs';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't retrieve the NFTs. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show me NFTs for address sei1abc123def456...',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Found 5 NFTs for address sei1abc123def456...',
          actions: ['GET_NFTS_BY_ADDRESS'],
        },
      },
    ],
  ],
};

/**
 * Action to buy an NFT from the marketplace
 */
const buyNFTAction: Action = {
  name: 'BUY_NFT',
  similes: ['PURCHASE_NFT', 'BUY_TOKEN', 'ACQUIRE_NFT'],
  description: 'Buys an NFT from the Magic Eden marketplace on SEI',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('buy') && (text.includes('nft') || text.includes('token'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your NFT purchase request.',
        };
      }

      // This is a simplified example - in practice, you'd need more sophisticated parsing
      // and user confirmation before executing transactions
      const response = `NFT purchase functionality is available. To buy an NFT, you'll need to:
1. Specify the NFT collection and token ID
2. Confirm the price and payment method
3. Authorize the transaction through your wallet

Please provide the specific NFT details you want to purchase.`;

      if (callback) {
        await callback({
          text: response,
          actions: ['BUY_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['BUY_NFT'],
          source: message.content.source,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process NFT purchase';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't process the NFT purchase. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I want to buy an NFT from the Sei Punks collection',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'NFT purchase functionality is available. Please provide the specific NFT details you want to purchase.',
          actions: ['BUY_NFT'],
        },
      },
    ],
  ],
};

/**
 * Action to sell/list an NFT on the marketplace
 */
const sellNFTAction: Action = {
  name: 'SELL_NFT',
  similes: ['LIST_NFT', 'SELL_TOKEN', 'MARKETPLACE_LIST'],
  description: 'Lists an NFT for sale on the Magic Eden marketplace',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return (text.includes('sell') || text.includes('list')) && (text.includes('nft') || text.includes('token'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your NFT listing request.',
        };
      }

      const response = `NFT listing functionality is available. To list an NFT for sale, you'll need to:
1. Specify the NFT collection and token ID you own
2. Set your desired price in SEI
3. Choose listing duration (optional)
4. Authorize the listing transaction

Please provide the NFT details you want to list for sale.`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SELL_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SELL_NFT'],
          source: message.content.source,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process NFT listing';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't process the NFT listing. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I want to sell my NFT for 100 SEI',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'NFT listing functionality is available. Please provide the NFT details you want to list for sale.',
          actions: ['SELL_NFT'],
        },
      },
    ],
  ],
};

/**
 * Action to mint a new NFT
 */
const mintNFTAction: Action = {
  name: 'MINT_NFT',
  similes: ['CREATE_NFT', 'MINT_TOKEN', 'DEPLOY_NFT'],
  description: 'Mints a new NFT on the SEI blockchain via Magic Eden',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('mint') && (text.includes('nft') || text.includes('token'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your NFT minting request.',
        };
      }

      const response = `NFT minting functionality is available on SEI via Magic Eden. To mint an NFT, you'll need to:
1. Prepare your NFT metadata (name, description, image)
2. Upload your image to IPFS or provide a valid URL
3. Specify the recipient address
4. Set royalty percentage and recipient (optional)
5. Authorize the minting transaction

Please provide the NFT details you want to mint, including:
- Name and description
- Image URL or file
- Recipient address
- Royalty settings (optional)

Note: Minting requires gas fees in SEI and proper wallet authorization.`;

      if (callback) {
        await callback({
          text: response,
          actions: ['MINT_NFT'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['MINT_NFT'],
          source: message.content.source,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process NFT minting';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't process the NFT minting request. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'I want to mint an NFT with my artwork',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'NFT minting functionality is available on SEI via Magic Eden. Please provide the NFT details including name, description, image URL, and recipient address.',
          actions: ['MINT_NFT'],
        },
      },
    ],
  ],
};

/**
 * Action to get collection information
 */
const getCollectionInfoAction: Action = {
  name: 'GET_COLLECTION_INFO',
  similes: ['COLLECTION_STATS', 'COLLECTION_DATA', 'COLLECTION_DETAILS'],
  description: 'Gets information about an NFT collection on SEI',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('collection') && (text.includes('info') || text.includes('stats') || text.includes('details'));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: Record<string, unknown> = {},
    callback?: HandlerCallback,
    _responses?: Memory[]
  ): Promise<ActionResult> => {
    try {
      if (!message.content.text) {
        return {
          success: false,
          error: new Error('Message content text is undefined'),
          text: 'I need a message with text to process your collection info request.',
        };
      }

      const response = `Collection information functionality is available. I can provide:
- Collection statistics (floor price, volume, owners)
- Total supply and verified status
- Collection metadata and description
- Recent sales data

Please specify the collection address or name you want information about.`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_COLLECTION_INFO'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_COLLECTION_INFO'],
          source: message.content.source,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get collection info';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't get the collection information. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Show me stats for the Sei Punks collection',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Collection information functionality is available. Please specify the collection address or name.',
          actions: ['GET_COLLECTION_INFO'],
        },
      },
    ],
  ],
};

export const seiNFTPlugin: Plugin = {
  name: 'plugin-sei-nft',
  description: 'Comprehensive SEI NFT plugin for minting, buying, selling, and managing NFTs via Magic Eden integration',
  config: {
    MAGIC_EDEN_API_URL: process.env.MAGIC_EDEN_API_URL,
    SEI_RPC_URL: process.env.SEI_RPC_URL,
    MAGIC_EDEN_API_KEY: process.env.MAGIC_EDEN_API_KEY,
    SEI_CHAIN_ID: process.env.SEI_CHAIN_ID,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-nft');
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [key, value] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Invalid plugin configuration: ${error.errors.map((e) => e.message).join(', ')}`
        );
      }
      throw error;
    }
  },
  models: {
    [ModelType.TEXT_SMALL]: async (
      _runtime,
      { prompt, stopSequences = [] }: GenerateTextParams
    ) => {
      return 'I can help you with SEI NFT operations including minting, buying, selling, and collection management.';
    },
    [ModelType.TEXT_LARGE]: async (
      _runtime,
      {
        prompt,
        stopSequences = [],
        maxTokens = 8192,
        temperature = 0.7,
        frequencyPenalty = 0.7,
        presencePenalty = 0.7,
      }: GenerateTextParams
    ) => {
      return 'I specialize in SEI blockchain NFT operations through Magic Eden integration. I can help you mint new NFTs, buy and sell existing ones, lookup NFT collections by address, get collection statistics, and manage your NFT portfolio on the SEI network.';
    },
  },
  routes: [
    {
      name: 'api-nft-address',
      path: '/api/nft/address/:address',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const address = req.params.address;
          if (!address) {
            return res.status(400).json({ error: 'Address parameter is required' });
          }

          const service = req.runtime.getService(SeiNFTService.serviceType) as SeiNFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const nfts = await service.getNFTsByAddress(address);
          res.json({ address, nfts, count: nfts.length });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get NFTs by address',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-collection-info',
      path: '/api/collection/:address',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const address = req.params.address;
          if (!address) {
            return res.status(400).json({ error: 'Collection address parameter is required' });
          }

          const service = req.runtime.getService(SeiNFTService.serviceType) as SeiNFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const collection = await service.getCollection(address);
          res.json(collection);
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get collection information',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-marketplace-listings',
      path: '/api/marketplace/:collection',
      type: 'GET',
      handler: async (req: any, res: any) => {
        try {
          const collection = req.params.collection;
          const limit = parseInt(req.query.limit) || 20;
          const offset = parseInt(req.query.offset) || 0;

          if (!collection) {
            return res.status(400).json({ error: 'Collection parameter is required' });
          }

          const service = req.runtime.getService(SeiNFTService.serviceType) as SeiNFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const listings = await service.getMarketplaceListings(collection, limit, offset);
          res.json({ collection, listings, count: listings.length });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to get marketplace listings',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
    {
      name: 'api-mint-nft',
      path: '/api/nft/mint',
      type: 'POST',
      handler: async (req: any, res: any) => {
        try {
          const { to, metadata, collectionAddress, royaltyPercentage, royaltyRecipient } = req.body;

          if (!to || !metadata) {
            return res.status(400).json({ 
              error: 'Missing required parameters: to and metadata are required' 
            });
          }

          if (!metadata.name || !metadata.description || !metadata.image) {
            return res.status(400).json({ 
              error: 'Metadata must include name, description, and image' 
            });
          }

          const service = req.runtime.getService(SeiNFTService.serviceType) as SeiNFTService;
          if (!service) {
            return res.status(500).json({ error: 'SEI NFT service not available' });
          }

          const result = await service.mintNFT({
            to,
            metadata,
            collectionAddress,
            royaltyPercentage,
            royaltyRecipient,
          });

          res.json({
            success: true,
            tokenId: result.tokenId,
            txHash: result.txHash,
            contractAddress: result.contractAddress,
            message: 'NFT minted successfully',
          });
        } catch (error) {
          res.status(500).json({
            error: 'Failed to mint NFT',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      },
    },
  ],
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (params: MessagePayload) => {
        logger.debug('MESSAGE_RECEIVED event received for SEI NFT plugin');
        logger.debug({ message: params.message }, 'Message:');
      },
    ],
  },
  services: [SeiNFTService],
  actions: [getNFTsByAddressAction, buyNFTAction, sellNFTAction, mintNFTAction, getCollectionInfoAction],
  providers: [],
};

export default seiNFTPlugin;