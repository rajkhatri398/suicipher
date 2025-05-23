const express = require('express');
const { SuiClient } = require('@mysten/sui.js/client');
const app = express();
const PORT = 3001;

app.use(express.json());

const client = new SuiClient({ url: getFullnodeUrl('testnet') });

// Endpoint to index vaults for a user
app.post('/api/vaults', async (req, res) => {
  const { address } = req.body;
  
  try {
    // Query for AccessNFTs owned by the user
    const objects = await client.getOwnedObjects({
      owner: address,
      filter: {
        StructType: `${packageId}::vault::AccessNFT`,
      },
    });
    
    // Get the vault details for each NFT
    const vaults = await Promise.all(
      objects.data.map(async (obj) => {
        const nft = await client.getObject({
          id: obj.data.objectId,
          options: { showContent: true },
        });
        
        const vaultId = nft.data.content.fields.vault_id;
        const vault = await client.getObject({
          id: vaultId,
          options: { showContent: true },
        });
        
        return {
          id: vaultId,
          createdAt: Number(vault.data.content.fields.created_at),
          creator: vault.data.content.fields.creator,
        };
      })
    );
    
    res.json({ vaults });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch vaults' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});