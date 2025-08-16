const { createWalletClient, createPublicClient, http, formatEther, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

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

async function debugSymphony() {
  try {
    console.log('=== Debugging Symphony SDK Configuration ===\n');
    
    const privateKey = '0xe85fa98df777aa09f62523461defba90a81eebeaef38aea6cfda8b43902f7fd1';
    const account = privateKeyToAccount(privateKey);
    
    console.log('1. Account Configuration:');
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
    
    console.log('2. Network Configuration:');
    console.log('   Chain ID:', seiTestnet.id);
    console.log('   RPC URL:', 'https://evm-rpc-testnet.sei-apis.com');
    
    // Check balance
    const balance = await publicClient.getBalance({ address: account.address });
    const balanceInEther = formatEther(balance);
    
    console.log('\n3. Balance Check:');
    console.log('   Raw Balance:', balance.toString());
    console.log('   Balance (SEI):', balanceInEther);
    
    // Test gas estimation for a simple transaction
    console.log('\n4. Gas Estimation Test:');
    try {
      const gasEstimate = await publicClient.estimateGas({
        account: account.address,
        to: '0x3273dC2d56e4B93AdA05D55871886bD69b4CEf3D', // Symphony contract
        value: parseEther('1'), // 1 SEI
      });
      console.log('   Estimated Gas:', gasEstimate.toString());
      
      const gasPrice = await publicClient.getGasPrice();
      console.log('   Gas Price:', gasPrice.toString());
      
      const totalCost = gasEstimate * gasPrice + parseEther('1');
      console.log('   Total Cost:', formatEther(totalCost), 'SEI');
      console.log('   Available:', balanceInEther, 'SEI');
      console.log('   Sufficient?', parseFloat(balanceInEther) > parseFloat(formatEther(totalCost)));
      
    } catch (gasError) {
      console.log('   Gas estimation failed:', gasError.message);
    }
    
    // Test Symphony SDK initialization
    console.log('\n5. Symphony SDK Test:');
    try {
      // Import Symphony dynamically to handle potential import issues
      const { Symphony } = await import('symphony-sdk/viem');
      const symphony = new Symphony();
      
      console.log('   Symphony SDK loaded successfully');
      
      // Connect wallet
      symphony.connectWalletClient(walletClient);
      console.log('   Wallet connected to Symphony');
      
      // Get Symphony config
      const config = symphony.getConfig();
      console.log('   Symphony Config:');
      console.log('     Native Address:', config.nativeAddress);
      console.log('     Network:', config.network || 'Not specified');
      
      // Check if the native address matches what we expect
      console.log('   Native token check:');
      console.log('     Expected: SEI native token');
      console.log('     Configured:', config.nativeAddress);
      
    } catch (symphonyError) {
      console.log('   Symphony SDK error:', symphonyError.message);
      console.log('   This might be the root cause of the issue');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Full error:', error);
  }
}

debugSymphony();