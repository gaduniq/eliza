# SEI NFT Plugin for ElizaOS

A comprehensive NFT plugin for the SEI blockchain that provides minting, buying, selling, and collection management functionality through Magic Eden integration.

## Features

- **NFT Lookup**: Get all NFTs owned by a specific SEI address
- **NFT Minting**: Create new NFTs on the SEI blockchain
- **Marketplace Integration**: Buy and sell NFTs through Magic Eden
- **Collection Information**: Get detailed stats about NFT collections
- **API Endpoints**: RESTful API for external integrations
- **Real-time Events**: Event handling for NFT operations

## Installation

1. Install the required dependencies:
```bash
npm install axios zod
```

2. Add the plugin to your ElizaOS configuration:
```typescript
import seiNFTPlugin from './sei-nft-plugin';

// Add to your plugins array
plugins: [seiNFTPlugin]
```

## Configuration

Set the following environment variables:

```bash
# Magic Eden API Configuration
MAGIC_EDEN_API_URL=https://api-mainnet.magiceden.dev
MAGIC_EDEN_API_KEY=your_magic_eden_api_key_here

# SEI Network Configuration
SEI_RPC_URL=https://evm-rpc.sei-apis.com
SEI_CHAIN_ID=1329
```

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MAGIC_EDEN_API_URL` | Magic Eden API base URL | `https://api-mainnet.magiceden.dev` | No |
| `MAGIC_EDEN_API_KEY` | Magic Eden API key for authenticated requests | - | Recommended |
| `SEI_RPC_URL` | SEI blockchain RPC endpoint | `https://evm-rpc.sei-apis.com` | No |
| `SEI_CHAIN_ID` | SEI network chain ID | `1329` | No |

## Usage

### Chat Commands

The plugin responds to natural language commands:

#### NFT Lookup
```
"Show me NFTs for address sei1abc123..."
"What NFTs does wallet sei1xyz789... own?"
"Display NFT portfolio for sei1def456..."
```

#### NFT Minting
```
"I want to mint an NFT with my artwork"
"Create a new NFT token"
"Mint an NFT for my collection"
```

#### Buying NFTs
```
"I want to buy an NFT from the Sei Punks collection"
"Purchase NFT token ID 123 from collection xyz"
"Buy this NFT for 100 SEI"
```

#### Selling NFTs
```
"I want to sell my NFT for 100 SEI"
"List my NFT token for sale"
"Put my NFT on the marketplace"
```

#### Collection Information
```
"Show me stats for the Sei Punks collection"
"Get collection info for address sei1collection..."
"Display collection details"
```

### API Endpoints

#### Get NFTs by Address
```http
GET /api/nft/address/:address
```

**Response:**
```json
{
  "address": "sei1abc123...",
  "nfts": [
    {
      "tokenId": "1",
      "contractAddress": "sei1contract...",
      "owner": "sei1abc123...",
      "metadata": {
        "name": "Sei Punk #1",
        "description": "A unique Sei Punk",
        "image": "https://...",
        "attributes": [...]
      },
      "price": "100",
      "currency": "SEI"
    }
  ],
  "count": 1
}
```

#### Get Collection Information
```http
GET /api/collection/:address
```

**Response:**
```json
{
  "address": "sei1collection...",
  "name": "Sei Punks",
  "symbol": "PUNK",
  "totalSupply": 10000,
  "floorPrice": "50",
  "volume24h": "1000",
  "owners": 5000,
  "verified": true
}
```

#### Get Marketplace Listings
```http
GET /api/marketplace/:collection?limit=20&offset=0
```

#### Mint NFT
```http
POST /api/nft/mint
```

**Request Body:**
```json
{
  "to": "sei1recipient...",
  "metadata": {
    "name": "My NFT",
    "description": "A unique digital asset",
    "image": "https://example.com/image.png",
    "attributes": [
      {
        "trait_type": "Color",
        "value": "Blue"
      }
    ]
  },
  "collectionAddress": "sei1collection...",
  "royaltyPercentage": 5,
  "royaltyRecipient": "sei1creator..."
}
```

**Response:**
```json
{
  "success": true,
  "tokenId": "123",
  "txHash": "0x...",
  "contractAddress": "sei1contract...",
  "message": "NFT minted successfully"
}
```

## SEI Network Setup

To interact with the SEI network, configure your wallet:

### Manual Configuration
- **Network Name**: Sei
- **RPC URL**: `https://evm-rpc.sei-apis.com`
- **Chain ID**: `1329`
- **Currency Symbol**: SEI
- **Block Explorer**: `https://seitrace.com`

### Automatic Configuration
Connect to Magic Eden and select 'Sei' to automatically add the network to your wallet.

## Magic Eden Integration

This plugin integrates with Magic Eden's marketplace and tools:

- **Launchpad**: For minting new NFT collections
- **Mint Terminal**: Simplified NFT creation
- **Marketplace**: Buy and sell NFTs
- **API**: Programmatic access to NFT data

## Actions

The plugin provides the following actions:

| Action | Name | Description |
|--------|------|-------------|
| NFT Lookup | `GET_NFTS_BY_ADDRESS` | Get NFTs owned by an address |
| Buy NFT | `BUY_NFT` | Purchase NFTs from marketplace |
| Sell NFT | `SELL_NFT` | List NFTs for sale |
| Mint NFT | `MINT_NFT` | Create new NFTs |
| Collection Info | `GET_COLLECTION_INFO` | Get collection statistics |

## Error Handling

The plugin includes comprehensive error handling:

- API rate limiting
- Network connectivity issues
- Invalid addresses or parameters
- Transaction failures
- Service unavailability

## Security Considerations

- API keys should be kept secure and not exposed in client-side code
- All transactions require proper wallet authorization
- Validate all user inputs before processing
- Use HTTPS for all API communications
- Implement proper access controls for sensitive operations

## Development

### Project Structure
```
sei-nft-plugin.ts          # Main plugin file
├── SeiNFTService          # Core NFT service
├── Actions                # Chat command handlers
│   ├── getNFTsByAddress
│   ├── buyNFT
│   ├── sellNFT
│   ├── mintNFT
│   └── getCollectionInfo
├── Routes                 # API endpoints
└── Events                 # Event handlers
```

### Testing

Test the plugin with various scenarios:

1. **Address Lookup**: Test with valid and invalid SEI addresses
2. **Collection Queries**: Test with existing and non-existent collections
3. **Error Cases**: Test API failures and network issues
4. **Rate Limiting**: Test API rate limits and retries

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Check the Magic Eden documentation
- Review SEI network documentation
- Open an issue in the repository

## Changelog

### v1.0.0
- Initial release
- NFT lookup functionality
- Magic Eden marketplace integration
- Minting, buying, and selling actions
- Collection information retrieval
- RESTful API endpoints
- Event handling system
