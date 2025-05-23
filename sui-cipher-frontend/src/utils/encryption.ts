import sodium from 'libsodium-wrappers';

export async function generateKeyPair() {
  await sodium.ready;
  return sodium.crypto_box_keypair();
}

export async function encryptData(data: string, publicKey: Uint8Array): Promise<{
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}> {
  await sodium.ready;
  
  // Generate an ephemeral key pair for this encryption
  const ephemeralKeyPair = await generateKeyPair();
  
  // Create a shared secret
  const sharedSecret = sodium.crypto_scalarmult(
    ephemeralKeyPair.privateKey,
    publicKey
  );
  
  // Derive a symmetric key
  const symmetricKey = sodium.crypto_generichash(
    32,
    sharedSecret
  );
  
  // Encrypt the data
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(
    new TextEncoder().encode(data),
    nonce,
    symmetricKey
  );
  
  return {
    ciphertext: new Uint8Array([...ephemeralKeyPair.publicKey, ...ciphertext]),
    nonce,
  };
}

export async function decryptData(
  encryptedData: Uint8Array,
  privateKey: Uint8Array,
  nonce: Uint8Array
): Promise<string> {
  await sodium.ready;
  
  // Extract the ephemeral public key (first 32 bytes)
  const ephemeralPublicKey = encryptedData.slice(0, 32);
  const ciphertext = encryptedData.slice(32);
  
  // Create the shared secret
  const sharedSecret = sodium.crypto_scalarmult(
    privateKey,
    ephemeralPublicKey
  );
  
  // Derive the symmetric key
  const symmetricKey = sodium.crypto_generichash(
    32,
    sharedSecret
  );
  
  // Decrypt the data
  const decrypted = sodium.crypto_secretbox_open_easy(
    ciphertext,
    nonce,
    symmetricKey
  );
  
  return new TextDecoder().decode(decrypted);
}