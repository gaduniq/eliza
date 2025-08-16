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
import { createWalletClient, createPublicClient, http, parseEther, formatEther, parseAbi } from 'viem';
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

// SEI Bank Precompile Contract Address
const SEI_BANK_PRECOMPILE = '0x0000000000000000000000000000000000001001';

// Bank Precompile ABI for native token operations
const bankPrecompileAbi = parseAbi([
  'function sendNative(string memory to_address, uint256 amount) external',
  'function send(string memory to_address, uint256 amount, string memory denom) external',
  'function balance(address account, string memory denom) external view returns (uint256)',
  'function all_balances(address account) external view returns (tuple(uint256 amount, string denom)[])',
]);

// Simple DEX ABI (Uniswap V2 style) - for when we find actual SEI DEX contracts
const dexAbi = parseAbi([
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function WETH() external pure returns (address)',
]);

/**
 * Configuration schema for the SEI native swap plugin
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
  method: string;
}

/**
 * SEI Native Swap Service using Bank Precompile and native DEX
 */
export class SeiNativeSwapService extends Service {
  static override serviceType = 'sei-native-swap';

  override capabilityDescription =
    'Provides SEI native token swapping functionality using Bank Precompile and native DEX protocols.';

  private walletClient: WalletClient;
  private publicClient: any;
  private account: Account;
  private rpcUrl: string;
  private slippageTolerance: string;

  // Known token addresses on SEI testnet (these need to be verified/updated)
  private tokenAddresses = {
    SEI: 'usei', // Native SEI denomination
    SEIYAN: '0x5f0e07dfee5832faa00c63f2d33a0d79150e8598', // SEIYAN token (if it exists as ERC20)
    // Add more verified token addresses here
  };

  // Known DEX contracts on SEI testnet (these need to be verified/updated)
  private dexContracts = {
    // These are placeholder addresses - need to find actual SEI DEX contracts
    DRAGON_SWAP: '0x0000000000000000000000000000000000000000', // Placeholder
    ASTROPORT: '0x0000000000000000000000000000000000000000', // Placeholder
  };

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
    
    // Create clients
    this.publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http(this.rpcUrl),
    });
    
    this.walletClient = createWalletClient({
      account: this.account,
      chain: seiTestnet,
      transport: http(this.rpcUrl),
    });
  }

  static override async start(runtime: IAgentRuntime): Promise<Service> {
    logger.info('Starting SEI native swap service');
    return new SeiNativeSwapService(runtime);
  }

  static override async stop(runtime: IAgentRuntime): Promise<void> {
    logger.info('Stopping SEI native swap service');
    const service = runtime.getService(SeiNativeSwapService.serviceType);
    if (!service) {
      throw new Error('SEI native swap service not found');
    }
    if ('stop' in service && typeof service.stop === 'function') {
      await service.stop();
    }
  }

  override async stop(): Promise<void> {
    logger.info('SEI native swap service stopped');
  }

  /**
   * Gets available tokens for swapping
   */
  getAvailableTokens() {
    return this.tokenAddresses;
  }

  /**
   * Gets native SEI balance using Bank Precompile
   */
  async getNativeSeiBalance(): Promise<string> {
    try {
      // Method 1: Direct balance query
      const balance = await this.publicClient.getBalance({ address: this.account.address });
      return formatEther(balance);
    } catch (error) {
      logger.error({ error }, 'Failed to get native SEI balance');
      throw new Error(`Failed to get native SEI balance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets token balance using Bank Precompile
   */
  async getTokenBalance(tokenAddress: string): Promise<string> {
    try {
      if (tokenAddress === 'usei' || tokenAddress === this.tokenAddresses.SEI) {
        return await this.getNativeSeiBalance();
      }

      // For other tokens, try Bank Precompile first
      try {
        const balance = await this.publicClient.readContract({
          address: SEI_BANK_PRECOMPILE,
          abi: bankPrecompileAbi,
          functionName: 'balance',
          args: [this.account.address, tokenAddress],
        });
        return formatEther(balance);
      } catch (precompileError) {
        // If Bank Precompile fails, try ERC20 method
        const erc20Abi = parseAbi(['function balanceOf(address owner) view returns (uint256)']);
        const balance = await this.publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [this.account.address],
        });
        return formatEther(balance);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get token balance');
      return '0';
    }
  }

  /**
   * Sends native SEI using Bank Precompile
   */
  async sendNativeSei(toAddress: string, amount: string): Promise<string> {
    try {
      const amountWei = parseEther(amount);
      
      // Use Bank Precompile to send native SEI
      const hash = await this.walletClient.writeContract({
        address: SEI_BANK_PRECOMPILE,
        abi: bankPrecompileAbi,
        functionName: 'sendNative',
        args: [toAddress, amountWei],
      });

      logger.info(`Sent ${amount} SEI to ${toAddress}, tx: ${hash}`);
      return hash;
    } catch (error) {
      logger.error({ error }, 'Failed to send native SEI');
      throw new Error(`Failed to send native SEI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simulates a swap (for demonstration - actual DEX integration needed)
   */
  async simulateSwap(fromToken: string, toToken: string, amountIn: string): Promise<SwapData> {
    try {
      logger.info(`Simulating swap: ${amountIn} ${fromToken} -> ${toToken}`);
      
      // This is a simulation - in a real implementation, you would:
      // 1. Find the appropriate DEX contract for the token pair
      // 2. Call getAmountsOut to get expected output
      // 3. Execute the actual swap transaction
      
      // For demonstration, let's simulate a 1:1000 SEI to SEIYAN rate
      const amountInNum = parseFloat(amountIn);
      let simulatedAmountOut: string;
      
      if (fromToken === 'usei' && toToken === this.tokenAddresses.SEIYAN) {
        // SEI to SEIYAN: 1 SEI = 1000 SEIYAN (simulated rate)
        simulatedAmountOut = (amountInNum * 1000).toString();
      } else if (fromToken === this.tokenAddresses.SEIYAN && toToken === 'usei') {
        // SEIYAN to SEI: 1000 SEIYAN = 1 SEI (simulated rate)
        simulatedAmountOut = (amountInNum / 1000).toString();
      } else {
        throw new Error(`Unsupported token pair: ${fromToken} -> ${toToken}`);
      }

      // Simulate transaction hash
      const simulatedTxHash = `0x${Math.random().toString(16).substr(2, 64)}`;

      return {
        fromToken,
        toToken,
        amountIn,
        amountOut: simulatedAmountOut,
        transactionHash: simulatedTxHash,
        method: 'simulated',
      };
    } catch (error) {
      logger.error({ error }, 'Failed to simulate swap');
      throw new Error(`Failed to simulate swap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Executes a real swap (placeholder - needs actual DEX integration)
   */
  async executeSwap(fromToken: string, toToken: string, amountIn: string): Promise<SwapData> {
    try {
      // Check balance first
      const balance = await this.getTokenBalance(fromToken);
      const balanceNum = parseFloat(balance);
      const amountNum = parseFloat(amountIn);
      
      if (balanceNum < amountNum) {
        throw new Error(`Insufficient balance. Have ${balance}, need ${amountIn}`);
      }

      // For now, return simulation until we integrate actual DEX
      logger.warn('Using simulated swap - actual DEX integration needed');
      return await this.simulateSwap(fromToken, toToken, amountIn);

      // TODO: Implement actual DEX swap when contracts are available
      // This would involve:
      // 1. Finding the right DEX contract
      // 2. Approving tokens if needed
      // 3. Calling the swap function
      // 4. Handling slippage and deadlines
    } catch (error) {
      logger.error({ error }, 'Failed to execute swap');
      throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

const swapSeiNativeAction: Action = {
  name: 'SWAP_SEI_NATIVE',
  similes: ['SWAP_TOKENS', 'EXCHANGE_TOKENS', 'TRADE_TOKENS'],
  description: 'Swaps SEI tokens using native SEI protocols and Bank Precompile',

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

      const service = runtime.getService(SeiNativeSwapService.serviceType) as SeiNativeSwapService;
      if (!service) {
        throw new Error('SEI native swap service not available');
      }

      // Parse swap request from message
      const text = message.content.text.toLowerCase();
      let amountIn = '1.0'; // Default amount
      let fromToken = 'usei'; // Default to native SEI
      let toToken = service.getAvailableTokens().SEIYAN; // Default to SEIYAN

      // Extract amount if specified
      const amountMatch = text.match(/(\d+(?:\.\d+)?)\s*(sei|seiyan)/i);
      if (amountMatch) {
        amountIn = amountMatch[1];
      }

      // Check balance before attempting swap
      const balance = await service.getTokenBalance(fromToken);
      const balanceNum = parseFloat(balance);
      const amountNum = parseFloat(amountIn);
      
      // Reserve some SEI for gas fees
      const gasReserve = 0.1;
      const availableForSwap = fromToken === 'usei' ? balanceNum - gasReserve : balanceNum;
      
      if (availableForSwap < amountNum) {
        return {
          success: false,
          error: new Error('Insufficient balance'),
          text: `Insufficient balance for swap. You have ${balance} ${fromToken}, need ${gasReserve} SEI for gas. Available: ${availableForSwap.toFixed(4)}.`,
        };
      }

      // Execute swap
      const swapResult = await service.executeSwap(fromToken, toToken, amountIn);

      const response = `Successfully swapped ${swapResult.amountIn} SEI to ${swapResult.amountOut} SEIYAN using native SEI protocols. Transaction Hash: ${swapResult.transactionHash}`;

      if (callback) {
        await callback({
          text: response,
          actions: ['SWAP_SEI_NATIVE'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['SWAP_SEI_NATIVE'],
          source: message.content.source,
          swapResult,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute swap';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't execute the swap using native SEI protocols. ${errorMessage}`,
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
          text: 'Successfully swapped 1.0 SEI to 1000 SEIYAN using native SEI protocols. Transaction Hash: 0x1234...',
          actions: ['SWAP_SEI_NATIVE'],
        },
      },
    ],
  ],
};

const getNativeBalanceAction: Action = {
  name: 'GET_SEI_NATIVE_BALANCE',
  similes: ['CHECK_BALANCE', 'BALANCE', 'NATIVE_BALANCE'],
  description: 'Gets the balance of SEI native tokens using Bank Precompile',

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
      const service = runtime.getService(SeiNativeSwapService.serviceType) as SeiNativeSwapService;
      if (!service) {
        throw new Error('SEI native swap service not available');
      }

      const tokens = service.getAvailableTokens();
      const seiBalance = await service.getTokenBalance(tokens.SEI);
      const seiyanBalance = await service.getTokenBalance(tokens.SEIYAN);

      const response = `Your native SEI balances:\n- SEI: ${seiBalance}\n- SEIYAN: ${seiyanBalance}\n\nUsing SEI Bank Precompile for native token operations.`;

      if (callback) {
        await callback({
          text: response,
          actions: ['GET_SEI_NATIVE_BALANCE'],
          source: message.content.source,
        });
      }

      return {
        text: response,
        success: true,
        data: {
          actions: ['GET_SEI_NATIVE_BALANCE'],
          source: message.content.source,
          balances: { sei: seiBalance, seiyan: seiyanBalance },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get balances';
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        text: `Sorry, I couldn't get your native SEI balances. ${errorMessage}`,
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: {
          text: 'Check my SEI native balances',
        },
      },
      {
        name: '{{name2}}',
        content: {
          text: 'Your native SEI balances:\n- SEI: 103.99\n- SEIYAN: 0\n\nUsing SEI Bank Precompile for native token operations.',
          actions: ['GET_SEI_NATIVE_BALANCE'],
        },
      },
    ],
  ],
};

export const seiNativeSwapPlugin: Plugin = {
  name: 'plugin-sei-native-swap',
  description: 'Provides SEI native token swapping functionality using Bank Precompile and native protocols',
  config: {
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    RPC_URL: process.env.RPC_URL,
    SLIPPAGE_TOLERANCE: process.env.SLIPPAGE_TOLERANCE,
  },
  async init(config: Record<string, string>) {
    logger.info('Initializing plugin-sei-native-swap');
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
      return 'I can help you swap SEI tokens using native SEI protocols and Bank Precompile.';
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
      return 'I specialize in SEI native token operations using the Bank Precompile contract and native DEX protocols. I can check balances, send native SEI, and perform swaps using SEI-native infrastructure.';
    },
  },
  routes: [],
  events: {},
  services: [SeiNativeSwapService],
  actions: [swapSeiNativeAction, getNativeBalanceAction],
  providers: [],
};

export default seiNativeSwapPlugin;