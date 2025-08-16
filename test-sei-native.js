const { createPublicClient, createWalletClient, http, formatEther, parseEther, parseAbi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

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

// SEI Bank Precompile Contract Address
const SEI_BANK_PRECOMPILE = '0x0000000000000000000000000000000000001001';

// Simplified Bank Precompile ABI (removing complex tuple syntax)
const bankPrecompileAbi = parseAbi([
  'function sendNative(string memory to_address, uint256 amount) external',
  'function send(string memory to_address, uint256 amount, string memory denom) external',
  'function balance(address account, string memory denom) external view returns (uint256)',
]);

async function testSeiNative() {
  try {
    console.log('=== Testing SEI Native Bank Precompile ===\n');
    
    const privateKey = '0xe85fa98df777aa09f62523461defba90a81eebeaef38aea6cfda8b43902f7fd1';
    const account = privateKeyToAccount(privateKey);
    
    const publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    const walletClient = createWalletClient({
      account,
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    console.log('1. Account Information:');
    console.log('   Address:', account.address);
    
    // Test native balance
    console.log('\n2. Native SEI Balance:');
    const nativeBalance = await publicClient.getBalance({ address: account.address });
    const nativeBalanceFormatted = formatEther(nativeBalance);
    console.log('   Native SEI:', nativeBalanceFormatted);
    
    // Test Bank Precompile balance query
    console.log('\n3. Bank Precompile Balance Query:');
    try {
      const precompileBalance = await publicClient.readContract({
        address: SEI_BANK_PRECOMPILE,
        abi: bankPrecompileAbi,
        functionName: 'balance',
        args: [account.address, 'usei'],
      });
      
      const precompileBalanceFormatted = formatEther(precompileBalance);
      console.log('   Bank Precompile SEI:', precompileBalanceFormatted);
      
      if (nativeBalanceFormatted === precompileBalanceFormatted) {
        console.log('   ✅ Bank Precompile balance matches native balance');
      } else {
        console.log('   ⚠️  Bank Precompile balance differs from native balance');
      }
      
    } catch (precompileError) {
      console.log('   ❌ Bank Precompile balance query failed:', precompileError.message);
      console.log('   💡 This might indicate the Bank Precompile is not available or configured differently');
    }
    
    // Test different denomination formats
    console.log('\n4. Testing Different Denomination Formats:');
    const denominations = ['usei', 'sei', 'SEI'];
    
    for (const denom of denominations) {
      try {
        const balance = await publicClient.readContract({
          address: SEI_BANK_PRECOMPILE,
          abi: bankPrecompileAbi,
          functionName: 'balance',
          args: [account.address, denom],
        });
        
        console.log(`   ${denom}: ${formatEther(balance)} SEI`);
      } catch (error) {
        console.log(`   ${denom}: Failed (${error.message.substring(0, 50)}...)`);
      }
    }
    
    // Test gas estimation for Bank Precompile operations
    console.log('\n5. Gas Estimation for Bank Precompile:');
    try {
      // Test gas estimation for sendNative (without actually sending)
      const gasEstimate = await publicClient.estimateContractGas({
        address: SEI_BANK_PRECOMPILE,
        abi: bankPrecompileAbi,
        functionName: 'sendNative',
        args: [account.address, parseEther('0.1')], // Send 0.1 SEI to self
        account: account.address,
      });
      
      console.log('   Estimated gas for sendNative:', gasEstimate.toString());
      
      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gasEstimate * gasPrice;
      const gasCostFormatted = formatEther(gasCost);
      
      console.log('   Gas price:', gasPrice.toString());
      console.log('   Total gas cost:', gasCostFormatted, 'SEI');
      
      if (parseFloat(nativeBalanceFormatted) > parseFloat(gasCostFormatted)) {
        console.log('   ✅ Sufficient balance for Bank Precompile operations');
      } else {
        console.log('   ❌ Insufficient balance for Bank Precompile operations');
      }
      
    } catch (gasError) {
      console.log('   ❌ Gas estimation failed:', gasError.message);
    }
    
    // Test if Bank Precompile contract exists
    console.log('\n6. Bank Precompile Contract Verification:');
    try {
      const code = await publicClient.getCode({ address: SEI_BANK_PRECOMPILE });
      if (code && code !== '0x') {
        console.log('   ✅ Bank Precompile contract exists');
        console.log('   Code length:', code.length, 'characters');
      } else {
        console.log('   ❌ Bank Precompile contract not found or empty');
      }
    } catch (codeError) {
      console.log('   ❌ Failed to check contract code:', codeError.message);
    }
    
    console.log('\n7. Summary:');
    console.log('   - Native SEI balance:', nativeBalanceFormatted);
    console.log('   - Bank Precompile address:', SEI_BANK_PRECOMPILE);
    console.log('   - Network: SEI Testnet (Chain ID 1329)');
    console.log('   - RPC: https://evm-rpc-testnet.sei-apis.com');
    
    console.log('\n8. Recommendations:');
    if (parseFloat(nativeBalanceFormatted) > 0) {
      console.log('   ✅ You have sufficient SEI for transactions');
      console.log('   💡 Can proceed with native token operations');
      console.log('   💡 Bank Precompile can be used for native SEI transfers');
    }
    
    console.log('\n9. Next Steps for DEX Integration:');
    console.log('   - 🔍 Find actual SEI DEX contract addresses');
    console.log('   - 🔍 Identify available token pairs');
    console.log('   - 🔍 Implement swap logic with verified DEX contracts');
    console.log('   - 🔍 Test with small amounts first');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSeiNative();