/**
 * Balance Utility Functions
 * ========================
 * 
 * This module provides utility functions for managing token balances across different chains.
 * It includes functions for fetching, caching, and refreshing balances.
 */

import { ethers } from 'ethers';
import { getTokenContract, getNetworkByChainId } from './blockchain';
import { deploymentsExist, getDeploymentByChainId } from './deployments';

// Cache for providers to avoid creating new ones for each balance check
let providerCache = {};

/**
 * Fetch token balance for the current chain
 * 
 * @param {Object} contract - Token contract instance
 * @param {string} address - Wallet address
 * @param {number} chainId - Current chain ID
 * @param {Function} setBalances - State setter for balances
 * @param {Function} setIsLoadingBalances - State setter for loading state
 */
export async function fetchTokenBalance(contract, address, chainId, setBalances, setIsLoadingBalances) {
  if (!contract || !address || !chainId) return;
  
  setIsLoadingBalances(prev => ({ ...prev, [chainId]: true }));
  
  try {
    const balance = await contract.balanceOf(address);
    const formattedBalance = ethers.formatEther(balance);
    setBalances(prev => ({ ...prev, [chainId]: formattedBalance }));
  } catch (error) {
    // Set to '0' instead of 'Error' to avoid displaying "Error MYERC20"
    setBalances(prev => ({ ...prev, [chainId]: '0' }));
  } finally {
    setIsLoadingBalances(prev => ({ ...prev, [chainId]: false }));
  }
}

/**
 * Fetch balance for a specific chain
 * 
 * @param {string} address - Wallet address
 * @param {number} targetChainId - Target chain ID
 * @param {number} currentChainId - Current chain ID
 * @param {Object} lastFetchTime - Last fetch time for each chain
 * @param {Function} setLastFetchTime - State setter for last fetch time
 * @param {Function} setBalances - State setter for balances
 * @param {Function} setIsLoadingBalances - State setter for loading state
 * @param {Function} setProviderCache - State setter for provider cache
 * @returns {Promise<void>}
 */
export async function fetchBalanceForChain(
  address,
  targetChainId,
  currentChainId,
  lastFetchTime,
  setLastFetchTime,
  setBalances,
  setIsLoadingBalances,
  setProviderCache
) {
  if (!address || !targetChainId || !deploymentsExist()) return;
  
  // Don't fetch if it's the current chain
  if (Number(targetChainId) === Number(currentChainId)) {
    return;
  }
  
  // Check if we've fetched this balance recently (within the last 10 seconds)
  const now = Date.now();
  const lastFetch = lastFetchTime[targetChainId] || 0;
  if (now - lastFetch < 10000) {
    console.log(`Skipping balance fetch for chain ${targetChainId} - fetched recently`);
    return;
  }
  
  const deployment = getDeploymentByChainId(targetChainId);
  if (!deployment) {
    console.error(`No deployment found for chain ID ${targetChainId}`);
    return;
  }
  
  setIsLoadingBalances(prev => ({ ...prev, [targetChainId]: true }));
  
  try {
    // Create or reuse provider for target chain
    let provider;
    if (providerCache[targetChainId]) {
      provider = providerCache[targetChainId];
    } else {
      const network = getNetworkByChainId(targetChainId);
      if (!network || !network.rpcUrl) {
        throw new Error(`No RPC URL found for chain ID ${targetChainId}`);
      }
      
      provider = new ethers.JsonRpcProvider(network.rpcUrl);
      
      // Cache the provider
      if (setProviderCache) {
        setProviderCache(prev => ({ ...prev, [targetChainId]: provider }));
        providerCache[targetChainId] = provider;
      }
    }
    
    const contract = getTokenContract(deployment.address, provider);
    
    // Get balance
    const balance = await contract.balanceOf(address);
    const formattedBalance = ethers.formatEther(balance);
    setBalances(prev => ({ ...prev, [targetChainId]: formattedBalance }));
    
    // Update last fetch time
    setLastFetchTime(prev => ({ ...prev, [targetChainId]: now }));
  } catch (error) {
    // Set to '0' instead of 'Error' to avoid displaying "Error MYERC20"
    setBalances(prev => ({ ...prev, [targetChainId]: '0' }));
  } finally {
    setIsLoadingBalances(prev => ({ ...prev, [targetChainId]: false }));
  }
}

/**
 * Refresh balances for source and destination chains
 * 
 * @param {Function} fetchTokenBalance - Function to fetch token balance
 * @param {Function} fetchBalanceForChain - Function to fetch balance for a specific chain
 * @param {Object} tokenContract - Token contract instance
 * @param {string} address - Wallet address
 * @param {string} destNetwork - Destination network key
 * @param {Object} networks - All available networks
 */
export function refreshBalances(
  fetchTokenBalanceFn,
  fetchBalanceForChainFn,
  destNetwork,
  networks
) {
  // Fetch source balance
  fetchTokenBalanceFn();
  
  // Fetch destination balance if needed
  if (destNetwork) {
    const destChainId = networks[destNetwork]?.chainId;
    if (destChainId) {
      fetchBalanceForChainFn(destChainId);
    }
  }
}

const balanceUtils = {
  fetchTokenBalance,
  fetchBalanceForChain,
  refreshBalances
};

export default balanceUtils;
