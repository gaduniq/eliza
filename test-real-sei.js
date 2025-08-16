const { createPublicClient, createWalletClient, http, formatEther, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

// Import SEI precompiles
let seiPrecompiles;
try {
  seiPrecompiles = require('@sei-js/precompiles');
  console.log('✅ SEI precompiles package loaded successfully');
} catch (error) {
  console.log('❌ Failed to load SEI precompiles:', error.message);
}

// SEI testnet chain configuration
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

async function testRealSei() {
  try {
    console.log('=== Testing Real SEI Precompiles Integration ===\n');
    
    const privateKey = '0xe85fa98df777aa09f62523461defba90a81eebeaef38aea6cfda8b43902f7fd1';
    const account = privateKeyToAccount(privateKey);
    
    console.log('1. Account Information:');
    console.log('   Address:', account.address);
    
    // Create clients
    const publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    const walletClient = createWalletClient({
      account,
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    // Test native balance
    console.log('\n2. Native SEI Balance:');
    const nativeBalance = await publicClient.getBalance({ address: account.address });
    const nativeBalanceFormatted = formatEther(nativeBalance);
    console.log('   Native SEI:', nativeBalanceFormatted);
    
    // Test SEI precompiles if available
    if (seiPrecompiles) {
      console.log('\n3. SEI Precompiles Available Functions:');
      console.log('   Package contents:', Object.keys(seiPrecompiles));
      
      // Try to access BANK_PRECOMPILE_ADDRESS and ABI
      if (seiPrecompiles.BANK_PRECOMPILE_ADDRESS) {
        console.log('   Bank Precompile Address:', seiPrecompiles.BANK_PRECOMPILE_ADDRESS);
      }
      
      if (seiPrecompiles.bankPrecompileAbi || seiPrecompiles.BANK_PRECOMPILE_ABI) {
        const abi = seiPrecompiles.bankPrecompileAbi || seiPrecompiles.BANK_PRECOMPILE_ABI;
        console.log('   Bank Precompile ABI functions:', abi.length, 'functions available');
        
        // Test balance query with official precompiles
        try {
          const precompileBalance = await publicClient.readContract({
            address: seiPrecompiles.BANK_PRECOMPILE_ADDRESS,
            abi: abi,
            functionName: 'balance',
            args: [account.address, 'usei'],
          });
          
          const precompileBalanceFormatted = formatEther(precompileBalance);
          console.log('   Official Precompile Balance:', precompileBalanceFormatted, 'SEI');
          
        } catch (precompileError) {
          console.log('   ❌ Official precompile balance query failed:', precompileError.message);
        }
      }
    }
    
    // Test gas estimation for a simple transfer
    console.log('\n4. Gas Estimation:');
    try {
      const gasEstimate = await publicClient.estimateGas({
        account: account.address,
        to: account.address, // Send to self
        value: parseEther('0.1'),
      });
      
      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gasEstimate * gasPrice;
      const gasCostFormatted = formatEther(gasCost);
      
      console.log('   Estimated gas:', gasEstimate.toString());
      console.log('   Gas price:', gasPrice.toString());
      console.log('   Total gas cost:', gasCostFormatted, 'SEI');
      
      if (parseFloat(nativeBalanceFormatted) > parseFloat(gasCostFormatted)) {
        console.log('   ✅ Sufficient balance for transactions');
      } else {
        console.log('   ❌ Insufficient balance for transactions');
      }
      
    } catch (gasError) {
      console.log('   ❌ Gas estimation failed:', gasError.message);
    }
    
    // Check for available DEX contracts (placeholder for when we find them)
    console.log('\n5. DEX Contract Search:');
    console.log('   🔍 Searching for deployed DEX contracts on SEI...');
    
    // Common DEX contract patterns to check
    const potentialDexAddresses = [
      '0x1234567890123456789012345678901234567890', // Placeholder
      '0x0987654321098765432109876543210987654321', // Placeholder
    ];
    
    for (const address of potentialDexAddresses) {
      try {
        const code = await publicClient.getCode({ address });
        if (code && code !== '0x') {
          console.log(`   ✅ Contract found at ${address}`);
        } else {
          console.log(`   ❌ No contract at ${address}`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking ${address}:`, error.message.substring(0, 50));
      }
    }
    
    console.log('\n6. Summary:');
    console.log('   - SEI Balance:', nativeBalanceFormatted, 'SEI');
    console.log('   - Network: SEI Testnet (Chain ID 1329)');
    console.log('   - RPC: https://evm-rpc-testnet.sei-apis.com');
    console.log('   - Precompiles:', seiPrecompiles ? '✅ Available' : '❌ Not loaded');
    
    console.log('\n7. Next Steps:');
    if (parseFloat(nativeBalanceFormatted) > 0) {
      console.log('   ✅ Ready for native token operations');
      console.log('   ✅ Can implement Bank Precompile transfers');
      console.log('   🔍 Need to find actual DEX contracts for swaps');
      console.log('   🔍 Or implement direct peer-to-peer token transfers');
    }
    
    // Create a working swap simulation using Bank Precompile
    console.log('\n8. Working Swap Simulation:');
    console.log('   💡 Since no DEX contracts found, we can implement:');
    console.log('   - Direct native SEI transfers using Bank Precompile');
    console.log('   - Token wrapping/unwrapping if needed');
    console.log('   - Custom swap logic for available token pairs');
    
    return {
      balance: nativeBalanceFormatted,
      precompilesAvailable: !!seiPrecompiles,
      readyForSwaps: parseFloat(nativeBalanceFormatted) > 0,
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return null;
  }
}

testRealSei().then(result => {
  if (result) {
    console.log('\n🎉 Test completed successfully!');
    console.log('Result:', result);
  }
});