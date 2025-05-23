import React, { useState, useEffect } from 'react';
import { 
  createWalletKit,
  WalletProvider,
  useWalletKit,
  ConnectButton
} from '@mysten/dapp-kit';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import * as sodium from 'libsodium-wrappers';
import '@mysten/dapp-kit/dist/index.css';

// Configuration
const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const packageId = "0x36ef13d982a8e53a08b782acedb6df469437de558ff9ed64cdc81eaf4750f43d";

interface Vault {
  id: string;
  createdAt: number;
}

interface UnlockConditions {
  timeLock: string;
  minSignatures: number;
  members: string[];
}

function App() {
  const { currentWallet, signAndExecuteTransactionBlock } = useWalletKit();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [newVaultData, setNewVaultData] = useState('');
  const [unlockConditions, setUnlockConditions] = useState<UnlockConditions>({
    timeLock: '',
    minSignatures: 1,
    members: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentWallet) {
      fetchUserVaults();
    }
  }, [currentWallet]);

  const fetchUserVaults = async () => {
    try {
      setError(null);
      if (!currentWallet) return;
      
      const address = currentWallet.accounts[0]?.address;
      console.log('Fetching vaults for', address);
      
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: {
          package: packageId,
        },
      });
      
      const userVaults = objects.data.map((obj: any) => ({
        id: obj.data?.objectId,
        createdAt: obj.data?.createdAt || Date.now()
      }));
      
      setVaults(userVaults);
    } catch (error) {
      console.error("Failed to fetch vaults:", error);
      setError("Failed to load vaults");
    }
  };

  const createVault = async () => {
    if (!newVaultData || !currentWallet) {
      setError("Wallet not connected or data missing");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      await sodium.ready;
      
      // Generate encryption key
      const key = sodium.crypto_secretbox_keygen();
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
      const encryptedData = sodium.crypto_secretbox_easy(
        newVaultData,
        nonce,
        key
      );
      
      // Prepare data for blockchain
      const fullEncryptedData = Array.from(nonce).concat(Array.from(new Uint8Array(encryptedData)));
      const conditionsBytes = Array.from(new TextEncoder().encode(JSON.stringify(unlockConditions)));
      
      const tx = new TransactionBlock();
      tx.setGasBudget(100000000);
      tx.moveCall({
        target: `${packageId}::vault::create_vault`,
        arguments: [
          tx.pure(fullEncryptedData),
          tx.pure(conditionsBytes),
          tx.pure(unlockConditions.members),
        ],
      });
      
      const result = await signAndExecuteTransactionBlock({ 
        transactionBlock: tx,
        options: {
          showEffects: true,
          showEvents: true
        }
      });
      
      if (result.effects?.status?.status === 'success') {
        setNewVaultData('');
        await fetchUserVaults();
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error) {
      console.error("Vault creation failed:", error);
      setError("Failed to create vault");
    } finally {
      setIsLoading(false);
    }
  };

  const unlockVault = async (vaultId: string) => {
    if (!currentWallet) {
      setError("Wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const tx = new TransactionBlock();
      tx.setGasBudget(100000000);
      tx.moveCall({
        target: `${packageId}::vault::unlock_vault`,
        arguments: [tx.object(vaultId), tx.object('0x6')],
      });
      
      await signAndExecuteTransactionBlock({ 
        transactionBlock: tx,
        options: {
          showEffects: true
        }
      });
    } catch (error) {
      console.error("Failed to unlock vault:", error);
      setError("Failed to unlock vault");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="App">
      <header>
        <h1>SuiCipher</h1>
        <ConnectButton />
      </header>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      {currentWallet ? (
        <div className="container">
          <section className="create-vault">
            <h2>Create New Vault</h2>
            <textarea
              value={newVaultData}
              onChange={(e) => setNewVaultData(e.target.value)}
              placeholder="Enter your secret message or upload files..."
              disabled={isLoading}
            />
            
            <div className="unlock-conditions">
              <h3>Unlock Conditions</h3>
              
              <div>
                <label>Time Lock (optional):</label>
                <input
                  type="datetime-local"
                  value={unlockConditions.timeLock}
                  onChange={(e) => setUnlockConditions({
                    ...unlockConditions,
                    timeLock: e.target.value
                  })}
                  disabled={isLoading}
                />
              </div>
              
              <div>
                <label>Minimum Signatures:</label>
                <input
                  type="number"
                  min="1"
                  value={unlockConditions.minSignatures}
                  onChange={(e) => setUnlockConditions({
                    ...unlockConditions,
                    minSignatures: parseInt(e.target.value) || 1
                  })}
                  disabled={isLoading}
                />
              </div>
              
              <div>
                <label>Members (comma separated Sui addresses):</label>
                <input
                  type="text"
                  value={unlockConditions.members.join(', ')}
                  onChange={(e) => setUnlockConditions({
                    ...unlockConditions,
                    members: e.target.value.split(',').map(m => m.trim())
                  })}
                  disabled={isLoading}
                  placeholder="0x123..., 0x456..."
                />
              </div>
            </div>
            
            <button 
              onClick={createVault} 
              disabled={isLoading || !newVaultData}
            >
              {isLoading ? 'Creating...' : 'Create Vault'}
            </button>
          </section>
          
          <section className="my-vaults">
            <h2>My Vaults</h2>
            {vaults.length === 0 ? (
              <p>No vaults found</p>
            ) : (
              <ul>
                {vaults.map((vault) => (
                  <li key={vault.id}>
                    <h3>Vault #{vault.id.slice(0, 8)}...</h3>
                    <p>Created: {new Date(vault.createdAt).toLocaleString()}</p>
                    <button 
                      onClick={() => unlockVault(vault.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Unlocking...' : 'Unlock Vault'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="connect-wallet-prompt">
          <p>Please connect your wallet to continue</p>
        </div>
      )}
    </div>
  );
}

export default function WrappedApp() {
  const walletKit = createWalletKit({
    preferredWallets: ['Sui Wallet', 'Ethos'],
  });

  return (
    <WalletProvider walletKit={walletKit}>
      <App />
    </WalletProvider>
  );
}