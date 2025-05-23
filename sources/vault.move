module sui_cipher::vault {
    use sui::object::{Self, UID};
    use sui::tx_context::TxContext;
    use sui::transfer;
    use sui::sui::SUI;
    use sui::dynamic_field;
    use sui::crypto;
    use sui::clock::{Self, Clock};
    use sui::event;

    // Struct representing an encrypted vault
    struct Vault has key, store {
        id: UID,
        encrypted_data: vector<u8>,
        unlock_conditions: vector<u8>, // Serialized unlock conditions
        access_nfts: vector<ID>,
        created_at: u64,
        creator: address,
    }

    // Access NFT that grants decryption rights
    struct AccessNFT has key, store {
        id: UID,
        vault_id: ID,
        owner: address,
        expiration: Option<u64>, // Optional time-lock
    }

    // Events
    struct VaultCreated has copy, drop {
        vault_id: ID,
        creator: address,
    }

    struct AccessGranted has copy, drop {
        vault_id: ID,
        recipient: address,
    }

    struct VaultUnlocked has copy, drop {
        vault_id: ID,
        unlocker: address,
    }

    // Create a new vault
    public entry fun create_vault(
        encrypted_data: vector<u8>,
        unlock_conditions: vector<u8>,
        initial_access: vector<address>,
        ctx: &mut TxContext
    ) {
        let vault_id = object::new(ctx);
        let access_nfts = vector::empty<ID>();

        // Create access NFTs for initial members
        let i = 0;
        while (i < vector::length(&initial_access)) {
            let recipient = *vector::borrow(&initial_access, i);
            let nft = AccessNFT {
                id: object::new(ctx),
                vault_id: object::uid_to_inner(&vault_id),
                owner: recipient,
                expiration: none(),
            };
            vector::push_back(&mut access_nfts, object::uid_to_inner(&nft.id));
            transfer::transfer(nft, recipient);
            i = i + 1;
        }

        let vault = Vault {
            id: vault_id,
            encrypted_data,
            unlock_conditions,
            access_nfts,
            created_at: clock::timestamp_ms(&clock::Clock { timestamp_ms: 0 }),
            creator: tx_context::sender(ctx),
        };

        transfer::share_object(vault);
        event::emit(VaultCreated {
            vault_id: object::uid_to_inner(&vault_id),
            creator: tx_context::sender(ctx),
        });
    }

    // Grant access to a new member
    public entry fun grant_access(
        vault: &mut Vault,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.creator, 0);
        
        let nft = AccessNFT {
            id: object::new(ctx),
            vault_id: object::uid_to_inner(&vault.id),
            owner: recipient,
            expiration: none(),
        };
        
        vector::push_back(&mut vault.access_nfts, object::uid_to_inner(&nft.id));
        transfer::transfer(nft, recipient);
        
        event::emit(AccessGranted {
            vault_id: object::uid_to_inner(&vault.id),
            recipient,
        });
    }

    // Attempt to unlock the vault
    public entry fun unlock_vault(
        vault: &Vault,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Verify access NFT ownership
        let has_access = false;
        let i = 0;
        while (i < vector::length(&vault.access_nfts)) {
            let nft_id = *vector::borrow(&vault.access_nfts, i);
            if (dynamic_field::exists_with_type<AccessNFT>(nft_id)) {
                let nft = dynamic_field::borrow<AccessNFT>(nft_id);
                if (nft.owner == tx_context::sender(ctx)) {
                    has_access = true;
                    break;
                }
            };
            i = i + 1;
        };
        
        assert!(has_access, 1); // EACCESS_DENIED
        
        // TODO: Verify other unlock conditions (time-based, multi-sig, etc.)
        
        event::emit(VaultUnlocked {
            vault_id: object::uid_to_inner(&vault.id),
            unlocker: tx_context::sender(ctx),
        });
    }
}