const { createPublicClient, http, formatEther } = require('viem');

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

async function testBalance() {
  try {
    console.log('Testing balance with EVM RPC endpoint...');
    
    const publicClient = createPublicClient({
      chain: seiTestnet,
      transport: http('https://evm-rpc-testnet.sei-apis.com'),
    });
    
    const walletAddress = '0xce87c6a49d48dc4c760C49d72BAB0c83088d9e31';
    const balance = await publicClient.getBalance({ address: walletAddress });
    const balanceInEther = formatEther(balance);
    
    console.log('Wallet Address:', walletAddress);
    console.log('Balance (raw):', balance.toString());
    console.log('Balance (SEI):', balanceInEther);
    
    if (parseFloat(balanceInEther) > 0) {
      console.log('✅ Balance check successful - sufficient funds available');
    } else {
      console.log('❌ Balance check failed - no funds available');
    }
    
  } catch (error) {
    console.error('❌ Error testing balance:', error.message);
  }
}

testBalance();