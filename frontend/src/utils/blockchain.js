/**
 * Blockchain Utility Functions
 * ============================
 * 
 * This module provides utility functions for interacting with the blockchain:
 * - Wallet connection and management
 * - Network switching
 * - Contract interaction
 * - Token operations (balance, bridging)
 * 
 * It dynamically loads network configurations from the deployments.json file,
 * ensuring that the frontend automatically detects new networks when they're added.
 */

import { ethers } from 'ethers';

// Import deployments directly for Vite
import deploymentsJson from '../config/deployments.json';

// Network configurations - dynamically loaded from deployments.json
let networks = {};

/**
 * Load network configurations from deployments
 * This ensures the frontend automatically detects new networks when they're added
 */
// Create network configurations from deployments
Object.entries(deploymentsJson).forEach(([chainId, deployment]) => {
  const chainIdNum = parseInt(chainId);
  const networkKey = deployment.network; // Use the full network name (e.g., 'avalanche-testnet')
  
  networks[networkKey] = {
    name: deployment.network,
    chainId: chainIdNum,
    // Use the RPC URL from the deployment if available
    rpcUrl: deployment.rpcUrl || '',
    // Use the block explorer from the deployment if available
    blockExplorer: deployment.blockExplorer || ''
  };
});

console.log(`Loaded ${Object.keys(networks).length} networks from deployments`);

/**
 * ABI for the MyERC20 contract
 * This includes all the functions and events we need to interact with the token contract
 */
const tokenABI = [
  // Basic ERC20 functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint)",
  
  // Cross-chain bridging function
  "function bridge(uint destChainId, address recipient, uint amount) returns ()",
  
  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
  "event TokensBridged(address indexed sender, uint indexed destChainId, address indexed recipient, uint amount)",
  "event TokensReceived(uint indexed sourceChainId, address indexed recipient, uint amount)"
];

/**
 * Connect to wallet using ethers
 * This function:
 * 1. Checks if a wallet is available
 * 2. Requests account access
 * 3. Creates a provider and signer
 * 4. Gets the user's address and current chain ID
 * 
 * @returns {Promise<Object>} Provider, signer, address, and chain ID
 * @throws {Error} If no wallet is found or connection fails
 */
export async function connectWallet() {
  // Check if MetaMask or another web3 wallet is installed
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask or another Web3 wallet.");
  }

  try {
    // Request account access
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    // Create provider and signer
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const chainId = await getChainId();

    console.log(`Connected to wallet: ${address} on chain ID: ${chainId}`);
    return { provider, signer, address, chainId };
  } catch (error) {
    console.error('Error connecting to wallet:', error);
    throw new Error(`Failed to connect wallet: ${error.message || 'User rejected the connection'}`);
  }
}

/**
 * Get current chain ID from the connected wallet
 * 
 * @returns {Promise<number>} Chain ID as a number
 * @returns {null} If no wallet is connected
 */
export async function getChainId() {
  if (!window.ethereum) return null;
  try {
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
  } catch (error) {
    console.error('Error getting chain ID:', error);
    return null;
  }
}

/**
 * Switch to a different network in the wallet
 * If the network doesn't exist in the wallet, it will be added automatically
 * 
 * @param {string} networkName - Network name (e.g., 'avalanche-testnet', 'base-testnet')
 * @throws {Error} If the network is not found or switching fails
 */
export async function switchNetwork(networkName) {
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet found. Please install MetaMask or another Web3 wallet.");
  }

  // Get network configuration
  const network = networks[networkName];
  if (!network) {
    throw new Error(`Network ${networkName} not found in deployments`);
  }

  // Convert chain ID to hex format (required by MetaMask)
  const chainIdHex = `0x${network.chainId.toString(16)}`;
  
  try {
    console.log(`Switching to network: ${network.name} (Chain ID: ${network.chainId})`);
    
    // Try to switch to the network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });
    
    console.log(`Successfully switched to ${network.name}`);
  } catch (error) {
    // If the network is not added to the wallet, add it
    if (error.code === 4902) {
      console.log(`Network ${network.name} not found in wallet, adding it...`);
      
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainIdHex,
              chainName: network.name,
              nativeCurrency: {
                name: 'ETH',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: [network.rpcUrl],
              blockExplorerUrls: network.blockExplorer ? [network.blockExplorer] : [],
            },
          ],
        });
        
        console.log(`Successfully added and switched to ${network.name}`);
      } catch (addError) {
        console.error('Error adding network:', addError);
        throw new Error(`Failed to add network: ${addError.message || 'User rejected the request'}`);
      }
    } else {
      console.error('Error switching network:', error);
      throw new Error(`Failed to switch network: ${error.message || 'User rejected the request'}`);
    }
  }
}

/**
 * Create a token contract instance
 * 
 * @param {string} contractAddress - Contract address
 * @param {Object} signer - Ethers signer
 * @returns {Object} Contract instance with connected signer
 */
export function getTokenContract(contractAddress, signer) {
  try {
    return new ethers.Contract(contractAddress, tokenABI, signer);
  } catch (error) {
    console.error('Error creating contract instance:', error);
    throw new Error(`Failed to create contract instance: ${error.message}`);
  }
}

/**
 * Get token balance for an address
 * 
 * @param {Object} contract - Token contract instance
 * @param {string} address - Wallet address
 * @returns {Promise<string>} Formatted balance in ETH units (e.g., "10.5")
 */
export async function getTokenBalance(contract, address) {
  try {
    const balance = await contract.balanceOf(address);
    return ethers.formatEther(balance);
  } catch (error) {
    console.error('Error getting token balance:', error);
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
}

/**
 * Bridge tokens from the current chain to another chain
 * This function:
 * 1. Converts the amount to wei
 * 2. Calls the bridge function on the contract
 * 3. Waits for the transaction to be confirmed
 * 
 * @param {Object} contract - Token contract instance
 * @param {number} destChainId - Destination chain ID
 * @param {string} recipient - Recipient address
 * @param {string} amount - Amount to bridge (in ETH units, e.g., "10.5")
 * @returns {Promise<Object>} Transaction receipt
 */
export async function bridgeTokens(contract, destChainId, recipient, amount) {
  try {
    // Convert amount to wei
    const amountWei = ethers.parseEther(amount);
    
    console.log(`Bridging ${amount} tokens to chain ID ${destChainId}, recipient: ${recipient || 'self'}`);
    
    // Send the transaction
    const tx = await contract.bridge(destChainId, recipient, amountWei);
    console.log(`Bridge transaction sent: ${tx.hash}`);
    
    // Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    return receipt;
  } catch (error) {
    console.error('Error bridging tokens:', error);
    
    // Provide more specific error messages but don't show alerts
    if (error.code === 'ACTION_REJECTED') {
      console.error('Transaction was rejected by the user');
      throw error;
    } else if (error.message && error.message.includes('insufficient funds')) {
      console.error('Insufficient funds to complete the transaction');
      throw error;
    } else {
      console.error(`Failed to bridge tokens: ${error.message || 'Unknown error'}`);
      throw error;
    }
  }
}

// Create a lookup map for faster network retrieval by chainId
const networksByChainId = {};

// Populate the lookup map
Object.entries(networks).forEach(([key, network]) => {
  networksByChainId[network.chainId] = { ...network, key };
});

/**
 * Find a network configuration by chain ID
 * 
 * @param {number} chainId - Chain ID to look up
 * @returns {Object|null} Network configuration or null if not found
 */
export function getNetworkByChainId(chainId) {
  if (!chainId) return null;
  const chainIdNum = Number(chainId);
  return networksByChainId[chainIdNum] || null;
}

/**
 * Get all available networks from deployments
 * 
 * @returns {Object} All networks
 */
export function getAllNetworks() {
  return { ...networks }; // Return a copy to prevent modification
}

/**
 * Set up listeners for wallet events
 * This function sets up handlers for:
 * - accountsChanged: When the user switches accounts or disconnects
 * - chainChanged: When the user switches networks
 * 
 * @param {Function} callback - Callback function to handle events
 */
export function listenForWalletEvents(callback) {
  if (!window.ethereum) {
    console.warn('No Ethereum wallet found, cannot listen for events');
    return;
  }

  // Remove any existing listeners to prevent duplicates
  window.ethereum.removeAllListeners('accountsChanged');
  window.ethereum.removeAllListeners('chainChanged');

  // Set up account change listener
  window.ethereum.on('accountsChanged', (accounts) => {
    console.log('Wallet accounts changed:', accounts);
    callback({ type: 'accountsChanged', accounts });
  });

  // Set up network change listener
  window.ethereum.on('chainChanged', (chainId) => {
    const chainIdNum = parseInt(chainId, 16);
    console.log('Wallet network changed to chain ID:', chainIdNum);
    callback({ type: 'chainChanged', chainId: chainIdNum });
  });
  
  console.log('Wallet event listeners set up successfully');
}
