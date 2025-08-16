const { createPublicClient, http, formatEther, parseAbi } = require('viem');

// SEI testnet chain configuration using EVM RPC endpoint
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
};

// ERC20 ABI for balanceOf function
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

async function testWSEIBalance() {
  try {
    console.log('=== Testing WSEI Token Balance ===\n');
    
    const publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    const walletAddress = '0xce87c6a49d48dc4c760C49d72BAB0c83088d9e31';
    const wseiAddress = '0xe30fedd158a2e3b13e9badaeabafc5516e95e8c7'; // From transaction data
    
    console.log('1. Native SEI Balance:');
    const nativeBalance = await publicClient.getBalance({ address: walletAddress });
    const nativeBalanceFormatted = formatEther(nativeBalance);
    console.log('   Address:', walletAddress);
    console.log('   Native SEI:', nativeBalanceFormatted);
    
    console.log('\n2. WSEI Token Balance:');
    try {
      // Get WSEI token info
      const wseiSymbol = await publicClient.readContract({
        address: wseiAddress,
        abi: erc20Abi,
        functionName: 'symbol',
      });
      
      const wseiDecimals = await publicClient.readContract({
        address: wseiAddress,
        abi: erc20Abi,
        functionName: 'decimals',
      });
      
      const wseiBalance = await publicClient.readContract({
        address: wseiAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      });
      
      const wseiBalanceFormatted = formatEther(wseiBalance);
      
      console.log('   Token Address:', wseiAddress);
      console.log('   Token Symbol:', wseiSymbol);
      console.log('   Token Decimals:', wseiDecimals);
      console.log('   WSEI Balance:', wseiBalanceFormatted);
      
      // Analysis
      console.log('\n3. Analysis:');
      if (parseFloat(wseiBalanceFormatted) > 0) {
        console.log('   ✅ You have WSEI tokens - swapping should work');
        console.log('   💡 Use WSEI address as fromToken in swaps');
      } else {
        console.log('   ❌ No WSEI tokens found');
        console.log('   💡 You need to wrap your native SEI to WSEI first');
        console.log('   💡 Or find a different DEX that accepts native SEI');
      }
      
      console.log('\n4. Recommendations:');
      if (parseFloat(nativeBalanceFormatted) > 0 && parseFloat(wseiBalanceFormatted) === 0) {
        console.log('   🔄 Wrap some native SEI to WSEI for trading');
        console.log('   ⛽ Keep some native SEI for gas fees');
        console.log('   📝 Suggested: Wrap 10-50 SEI, keep rest for gas');
      }
      
    } catch (tokenError) {
      console.log('   ❌ Error reading WSEI token:', tokenError.message);
      console.log('   💡 The token address might be incorrect or the token might not exist');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWSEIBalance();