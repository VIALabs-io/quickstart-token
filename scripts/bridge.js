/**
 * Cross-Chain ERC20 Token Bridge Script
 * =====================================
 * 
 * This script allows bridging tokens between different blockchain networks.
 * It reads deployment information from the frontend config and uses it to:
 * 
 * 1. Connect to the source network
 * 2. Bridge tokens to the destination network
 * 3. Provide feedback on the bridging process
 * 
 * The script is designed to work with the MyERC20 token contract deployed
 * by the deploy.js script.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { networks } = require('../network.config');
require('dotenv').config();

/**
 * Get contract instance for a specific network
 * This function reads deployment information from the frontend config
 * 
 * @param {string} networkName - Network name from network.config.js
 * @returns {Promise<Object>} Contract instance and related information
 */
async function getContract(networkName) {
  const network = networks[networkName];
  if (!network) {
    throw new Error(`Network ${networkName} not found`);
  }
  
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(network.rpcUrl);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', provider);
  
  // Get deployment info from the frontend config
  const frontendConfigPath = path.join(__dirname, '../frontend/src/config/deployments.json');
  
  if (!fs.existsSync(frontendConfigPath)) {
    throw new Error(`Deployment configuration not found. Please deploy the contract first.`);
  }
  
  const deployments = JSON.parse(fs.readFileSync(frontendConfigPath, 'utf8'));
  const providerNetwork = await provider.getNetwork();
  const chainId = providerNetwork.chainId;
  
  const chainIdKey = Number(chainId);
  if (!deployments[chainIdKey]) {
    throw new Error(`No deployment found for chain ID ${chainIdKey}. Please deploy the contract first.`);
  }
  
  const deploymentInfo = deployments[chainIdKey];
  
  // Create contract instance
  return {
    contract: new ethers.Contract(deploymentInfo.address, deploymentInfo.abi, wallet),
    chainId: deploymentInfo.chainId,
    network: network
  };
}

/**
 * Wait for the TokensReceived event on the destination chain using polling
 * 
 * @param {Object} destContract - Destination contract instance
 * @param {string} sourceChainId - Source chain ID
 * @param {string} recipientAddress - Recipient address
 * @param {string} amount - Amount of tokens bridged
 * @param {Object} destNetwork - Destination network information
 * @param {string} txHash - Source transaction hash
 * @param {number} timeout - Timeout in milliseconds (default: 5 minutes)
 * @returns {Promise<Object|null>} Event object or null if timeout
 */
async function waitForTokensReceived(destContract, sourceChainId, recipientAddress, amount, destNetwork, txHash, timeout = 5 * 60 * 1000) {
  console.log(`\nWaiting for tokens to be received on the destination chain...`);
  console.log(`This may take a few minutes. Timeout set to ${timeout/1000} seconds.`);
  
  return new Promise((resolve) => {
    const startTime = Date.now();
    const amountWei = ethers.parseEther(amount);
    const pollInterval = 10000; // 10 seconds
    
    // Initial balance check
    let initialBalance = null;
    
    // Polling function to check for balance changes
    const checkBalance = async () => {
      try {
        // Get current balance
        const currentBalance = await destContract.balanceOf(recipientAddress);
        
        // Initialize initial balance if not set
        if (initialBalance === null) {
          initialBalance = currentBalance;
          console.log(`Initial balance on destination chain: ${ethers.formatEther(currentBalance)} tokens`);
        }
        
        // Check if balance has increased by the expected amount
        if (currentBalance > initialBalance) {
          const difference = currentBalance - initialBalance;
          
          // If the difference matches our expected amount (or is close enough)
          if (Math.abs(Number(difference - amountWei)) < 1000) { // Allow for small rounding differences
            console.log(`\n✅ Tokens received on destination chain!`);
            console.log(`   Recipient: ${recipientAddress}`);
            console.log(`   Amount: ${ethers.formatEther(difference)} tokens`);
            
            // Provide links to explorers
            if (destNetwork.blockExplorer) {
              const recipientExplorerUrl = `${destNetwork.blockExplorer}/address/${recipientAddress}`;
              console.log(`\nView recipient's wallet on destination chain explorer:`);
              console.log(recipientExplorerUrl);
            }
            
            // Show VIA Labs scanner links
            console.log(`\nView on VIA Labs scanner:`);
            console.log(`Transaction: https://scan.vialabs.io/transaction/${txHash}`);
            
            clearInterval(intervalId);
            clearTimeout(timeoutId);
            resolve({ recipient: recipientAddress, amount: difference });
            return;
          }
        }
        
        // Check if we've reached the timeout
        if (Date.now() - startTime > timeout) {
          clearInterval(intervalId);
          console.log(`\n⚠️ Timeout reached. Tokens may still be received later.`);
          console.log(`   You can check your balance on the destination chain manually.`);
          resolve(null);
        }
      } catch (error) {
        console.log(`Error checking balance: ${error.message}`);
      }
    };
    
    // Start polling
    const intervalId = setInterval(checkBalance, pollInterval);
    
    // Initial check
    checkBalance();
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      console.log(`\n⚠️ Timeout reached. Tokens may still be received later.`);
      console.log(`   You can check your balance on the destination chain manually.`);
      resolve(null);
    }, timeout);
    
    // Allow early cancellation
    process.on('SIGINT', () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      console.log(`\n⚠️ Monitoring cancelled. Tokens may still be received later.`);
      console.log(`   You can check your balance on the destination chain manually.`);
      resolve(null);
      process.exit(0);
    });
  });
}

/**
 * Bridge tokens from source network to destination network
 * 
 * @param {string} sourceNetwork - Source network name
 * @param {string} destNetwork - Destination network name
 * @param {string} amount - Amount of tokens to bridge (in ETH format)
 * @param {string} recipient - Optional recipient address (defaults to sender)
 * @param {boolean} waitForCompletion - Whether to wait for the tokens to be received on the destination chain
 * @returns {Promise<void>}
 */
async function bridge(sourceNetwork, destNetwork, amount, recipient, waitForCompletion = true) {
  console.log(`=== Bridging ${amount} tokens from ${sourceNetwork} to ${destNetwork} ===`);
  
  // Get source contract
  const source = await getContract(sourceNetwork);
  console.log(`Source contract address: ${await source.contract.getAddress()}`);
  
  // Get destination contract
  const dest = await getContract(destNetwork);
  console.log(`Destination contract address: ${await dest.contract.getAddress()}`);
  
  // Check balance
  const balance = await source.contract.balanceOf(source.contract.runner.address);
  const formattedBalance = ethers.formatEther(balance);
  console.log(`Current balance on ${sourceNetwork}: ${formattedBalance} tokens`);
  
  // Convert amount to wei
  const amountWei = ethers.parseEther(amount);
  
  if (balance < amountWei) {
    throw new Error(`Insufficient balance. You have ${formattedBalance} tokens, but trying to bridge ${amount} tokens.`);
  }
  
  // Use the recipient address or default to the sender's address
  const recipientAddress = recipient || source.contract.runner.address;
  console.log(`Recipient address: ${recipientAddress}`);
  
  // Bridge tokens
  console.log(`Bridging ${amount} tokens to chain ID ${dest.chainId}...`);
  const tx = await source.contract.bridge(dest.chainId, recipientAddress, amountWei);
  
  console.log(`Transaction hash: ${tx.hash}`);
  
  // Generate source chain explorer link
  if (source.network.blockExplorer) {
    const sourceExplorerUrl = `${source.network.blockExplorer}/tx/${tx.hash}`;
    console.log(`Source chain explorer: ${sourceExplorerUrl}`);
  }
  
  console.log('Waiting for confirmation...');
  
  await tx.wait();
  console.log('Bridge transaction confirmed!');
  
  console.log(`\nTokens are being bridged from ${sourceNetwork} to ${destNetwork}.`);
  console.log('The cross-chain message will take a few minutes to be processed.');
  
  // Wait for tokens to be received on the destination chain if requested
  if (waitForCompletion) {
    await waitForTokensReceived(
      dest.contract,
      source.chainId,
      recipientAddress,
      amount,
      dest.network,
      tx.hash
    );
  } else {
    console.log(`Check your balance on ${destNetwork} after a few minutes.`);
  }
}

/**
 * Main execution function
 * Parses command line arguments and initiates the bridge process
 */
async function main() {
  // Get command line arguments
  const sourceNetwork = process.argv[2];
  const destNetwork = process.argv[3];
  const amount = process.argv[4] || '1'; // Default to 1 token
  const recipient = process.argv[5]; // Optional recipient address
  const waitFlag = process.argv[6]; // Optional wait flag
  
  // Determine if we should wait for completion
  const waitForCompletion = waitFlag !== 'nowait';
  
  if (!sourceNetwork || !destNetwork) {
    console.error('Usage: node bridge.js <source-network> <dest-network> [amount] [recipient] [nowait]');
    console.error('Example: node bridge.js avalanche-testnet base-testnet 5 0x1234...');
    console.error('Add "nowait" as the last argument to skip waiting for confirmation on the destination chain');
    process.exit(1);
  }
  
  if (!networks[sourceNetwork]) {
    console.error(`Source network ${sourceNetwork} not found`);
    process.exit(1);
  }
  
  if (!networks[destNetwork]) {
    console.error(`Destination network ${destNetwork} not found`);
    process.exit(1);
  }
  
  try {
    await bridge(sourceNetwork, destNetwork, amount, recipient, waitForCompletion);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
