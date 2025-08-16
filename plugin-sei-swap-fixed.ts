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
import { Symphony } from "symphony-sdk/viem";
import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { WalletClient, Account } from 'viem';

// Define SEI testnet chain configuration using EVM RPC endpoint
const seiTestnet = {
  id: 1329,
  name: 'SEI Testnet',
  network: 'sei-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'SEI',
    symbol: 'SEI',
  },
  rpcUrls: {
    default: { http: ['https://evm-rpc-testnet.sei-apis.com'] },
    public: { http: ['https://evm-rpc-testnet.sei-apis.com'] },
  },
  blockExplorers: {
    default: { name: 'SEI Explorer', url: 'https://testnet.sei.io' },
  },
} as const;

/**
 * Defines the configuration schema for the SEI swap plugin
 */
const configSchema = z.object({
  PRIVATE_KEY: z.string().min(1, 'Private key is required'),
  RPC_URL: z.string().url().default('https://evm-rpc-testnet.sei-apis.com'),
  SLIPPAGE_TOLERANCE: z.string().default('1.0'),
});

/**
 * Interface for swap data
 */
interface SwapData {
  fromToken: string;
  toToken: string;
  amountIn: string;
  amountOut: string;
  transactionHash: string;
  route: any;
}

/**
 * SEI Swap Service to handle token swapping functionality
 */
export class SeiSwapService extends Service {
  static override serviceType = 'sei-swap';

  override capabilityDescription =
    'Provides SEI token swapping functionality using Symphony protocol.';

  private symphony: Symphony;
  private walletClient: WalletClient;
  private publicClient: any;
  private account: Account;
  private rpcUrl: string;
  private slippageTolerance: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.rpcUrl = process.env.RPC_URL || 'https://evm-rpc-testnet.sei-apis.com';
    this.slippageTolerance = process.env.SLIPPAGE_TOLERANCE || '1.0';
    
    // Initialize wallet client with private key
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }
    
    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    
    // Create public client for balance queries
    this.publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http(this.rpcUrl),
    });
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: seiTestnet,
      transport: http(this.rpcUrl),
    });
    
    // Initialize Symphony with proper SEI configuration
    this.symphony = new Symphony({
      chainId: 1329, // SEI testnet
      rpcUrl: this.rpcUrl,
      // Configure native token properly for SEI
      nativeTokenAddress: '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7', // WSEI address from transaction
    });
    
    // Connect wallet to Symphony
    this.symphony.connectWalletClient(this.walletClient);
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI swap service');
    return new SeiSwapService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI swap service');
    const service = runtime.getService(SeiSwapService.serviceType);
    if (!service) {
      throw new Error('SEI swap service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI swap service stopped');
  }

  /**
   * Gets available tokens for swapping
   */
  getAvailableTokens() {
    return {
      native: '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7', // WSEI (wrapped SEI)
      seiyan: '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598', // SEIYAN
      // Add more tokens as needed
    };
  }

  /**
   * Gets a swap route
   */
  async getSwapRoute(fromToken: string, toToken: string, amountIn: string): Promise<any> {
    try {
      logger.info(`Getting route: ${fromToken} -> ${toToken}, amount: ${amountIn}`);
      
      const route = await this.symphony.getRoute(
        fromToken,
        toToken,
        parseEther(amountIn).toString() // Convert to wei
      );
      return route;
    } catch (error) {
      logger.error({ error }, 'Failed to get swap route');
      throw new Error(`Failed to get swap route: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes a swap with proper balance and gas management
   */
  async executeSwap(route: any, slippageAmount: string = '1'): Promise<SwapData> {
    try {
      // Check native SEI balance (for gas fees)
      const nativeBalance = await this.publicClient.getBalance({ address: this.account.address });
      const nativeBalanceFormatted = formatEther(nativeBalance);
      logger.info(`Native SEI balance: ${nativeBalanceFormatted}`);
      
      // Estimate gas for the transaction
      const gasPrice = await this.publicClient.getGasPrice();
      const estimatedGasCost = BigInt(2000000) * gasPrice; // Conservative gas estimate
      const estimatedGasCostFormatted = formatEther(estimatedGasCost);
      
      logger.info(`Estimated gas cost: ${estimatedGasCostFormatted} SEI`);
      
      // Check if we have enough native SEI for gas
      if (nativeBalance < estimatedGasCost) {
        throw new Error(`Insufficient native SEI for gas fees. Need ${estimatedGasCostFormatted} SEI, have ${nativeBalanceFormatted} SEI`);
      }
      
      // For native token swaps, check if we have enough for both gas and swap amount
      if (route.tokenIn === this.getAvailableTokens().native) {
        const swapAmount = BigInt(route.amountIn);
        const totalRequired = estimatedGasCost + swapAmount;
        const totalRequiredFormatted = formatEther(totalRequired);
        
        if (nativeBalance < totalRequired) {
          throw new Error(`Insufficient balance for swap + gas. Need ${totalRequiredFormatted} SEI, have ${nativeBalanceFormatted} SEI`);
        }
      }
      
      // Execute the swap with controlled gas parameters
      const transaction = await route.swap({
        slippage: {
          slippageAmount: slippageAmount,
        },
        gasLimit: 2000000, // Set reasonable gas limit
        gasPrice: gasPrice.toString(),
      });

      return {
        fromToken: route.tokenIn,
        toToken: route.tokenOut,
        amountIn: route.amountInFormatted,
        amountOut: route.amountOutFormatted,
        transactionHash: transaction.swapReceipt.transactionHash,
        route: route
      };
    } catch (error) {
      logger.error({ error }, 'Failed to execute swap');
      throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets token balance
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    try {
      // For native SEI, use getBalance
      if (tokenAddress === this.getAvailableTokens().native) {
        const balance = await this.publicClient.getBalance({ address: this.account.address });
        return formatEther(balance);
      }
      
      // For ERC20 tokens, implement token balance checking
      // This would require calling the ERC20 balanceOf function
      // For now, return a placeholder
      return '0';
    } catch (error) {
      logger.error({ error }, 'Failed to get token balance');
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Wraps native SEI to WSEI if needed
   */
  async wrapSEI(amount: string): Promise<string> {
    try {
      // This would implement the wrapping logic
      // For now, assume the user already has WSEI
      logger.info(`Wrapping ${amount} SEI to WSEI`);
      return 'wrapped-transaction-hash';
    } catch (error) {
      logger.error({ error }, 'Failed to wrap SEI');
      throw new Error(`Failed to wrap SEI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const swapSeiAction: Action = {
  name: 'SWAP_SEI',
  similes: ['SWAP_TOKENS', 'EXCHANGE_TOKENS', 'TRADE_TOKENS'],
  description: 'Swaps SEI tokens using Symphony protocol',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('swap') || 
           text.includes('exchange') || 
           text.includes('trade') ||
           text.includes('convert');
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
          text: 'I need a message with text to process your swap request.',
        };
      }

      const service = runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
      if (!service) {
        throw new Error('SEI swap service not available');
      }

      // Parse swap request from message
      const text = message.content.text.toLowerCase();
      let amountIn = '1.0'; // Default amount
      let fromToken = service.getAvailableTokens().native; // Default to WSEI
      let toToken = service.getAvailableTokens().seiyan; // Default to SEIYAN

      // Extract amount if specified
      const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(sei|seiyan)/i);
      if (amountMatch) {
        amountIn = amountMatch[1];
      }

      // Check balance before attempting swap
      const balance = await service.getTokenBalance(fromToken);
      const balanceNum = parseFloat(balance);
      const amountNum = parseFloat(amountIn);
      
      // For native token swaps, we need to account for gas fees
      const gasReserve = 0.1; // Reserve 0.1 SEI for gas
      const availableForSwap = balanceNum - gasReserve;
      
      if (availableForSwap < amountNum) {
        return {
          success: false,
          error: new Error('Insufficient balance'),
          text: `Insufficient balance for swap. You have ${balance} SEI, but need ${gasReserve} SEI for gas fees. Available for swap: ${availableForSwap.toFixed(4)} SEI.`,
        };
      }

      // Get swap route
      const route = await service.getSwapRoute(fromToken, toToken, amountIn);
      
      // Execute swap
      const swapResult = await service.executeSwap(route, process.env.SLIPPAGE_TOLERANCE || '1');

      const response = `Successfully swapped ${swapResult.amountIn} WSEI to ${swapResult.amountOut} SEIYAN. Transaction Hash: ${swapResult.transactionHash}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SWAP_SEI'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SWAP_SEI'],
          source: message.content.source,
          swapResult,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't execute the swap. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Swap 1 SEI to SEIYAN',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Successfully swapped 1.0 WSEI to 0.95 SEIYAN. Transaction Hash: 0x1234...',
          actions: ['SWAP_SEI'],
        },
      },
    ],
  ],
};

const getBalanceAction: Action = {
  name: 'GET_TOKEN_BALANCE',
  similes: ['CHECK_BALANCE', 'BALANCE', 'TOKEN_BALANCE'],
  description: 'Gets the balance of specified tokens',

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined
  ): Promise<boolean> => {
    if (!message.content.text) return false;
    
    const text = message.content.text.toLowerCase();
    return text.includes('balance') || 
           text.includes('check balance') || 
           text.includes('how much');
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
      const service = runtime.getService(SeiSwapService.serviceType) as SeiSwapService;
      if (!service) {
        throw new Error('SEI swap service not available');
      }

      const tokens = service.getAvailableTokens();
      const seiBalance = await service.getTokenBalance(tokens.native);
      const seiyanBalance = await service.getTokenBalance(tokens.seiyan);

      const response = `Your balances:\n- SEI: ${seiBalance}\n- SEIYAN: ${seiyanBalance}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_TOKEN_BALANCE'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_TOKEN_BALANCE'],
          source: message.content.source,
          balances: { sei: seiBalance, seiyan: seiyanBalance },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get balances';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't get your balances. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check my token balances',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your balances:\n- SEI: 10.5\n- SEIYAN: 25.0',
          actions: ['GET_TOKEN_BALANCE'],
        },
      },
    ],
  ],
};

export const seiSwapPlugin: Plugin = {
  name: 'plugin-sei-swap-fixed',
  description: 'Provides SEI token swapping functionality using Symphony protocol with proper native token handling',
  config: {
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    RPC_URL: process.env.RPC_URL,
    SLIPPAGE_TOLERANCE: process.env.SLIPPAGE_TOLERANCE,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-swap-fixed');
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
      return 'I can help you swap SEI tokens using Symphony protocol with proper native token handling.';
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
      return 'I specialize in SEI token swapping using the Symphony protocol with proper native token configuration. You can ask me to swap WSEI to SEIYAN, check balances, or get swap routes.';
    },
  },
  routes: [],
  events: {},
  services: [SeiSwapService],
  actions: [swapSeiAction, getBalanceAction],
  providers: [],
};

export default seiSwapPlugin;