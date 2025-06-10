/**
 * Cross-Chain Token Bridge Interface
 * ==================================
 * 
 * This is the main application component for the cross-chain token bridge.
 * It provides a professional bridge interface similar to popular DeFi bridges,
 * allowing users to seamlessly transfer tokens between different blockchain networks.
 * 
 * Key features:
 * - Modern, intuitive bridge UI
 * - Source and destination chain selection
 * - Token input/output display
 * - Wallet connection
 * - Real-time balance updates
 */

import React, { useState, useEffect, useCallback } from 'react';
import WalletConnect from './components/WalletConnect.jsx';
import NetworkSelector from './components/NetworkSelector.jsx';
import TokenBridge from './components/TokenBridge.jsx';
import BridgeModal from './components/BridgeModal.jsx';
import {
  connectWallet,
  switchNetwork,
  getTokenContract,
  getNetworkByChainId,
  getAllNetworks,
  listenForWalletEvents
} from './utils/blockchain';
import {
  deploymentsExist,
  getDeploymentByChainId,
  getDeploymentErrorMessage
} from './utils/deployments';
import {
  fetchTokenBalance,
  fetchBalanceForChain
} from './utils/balances';
import { ethers } from 'ethers';

function App() {
  // ======== State Management ========

  // Wallet state
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [signer, setSigner] = useState(null);

  // Network state
  const [sourceNetwork, setSourceNetwork] = useState('');
  const [destNetwork, setDestNetwork] = useState('');

  // Token state
  const [tokenContract, setTokenContract] = useState(null);
  const [tokenSymbol, setTokenSymbol] = useState('MYERC20');

  // Balance state
  const [balances, setBalances] = useState({});
  const [isLoadingBalances, setIsLoadingBalances] = useState({});

  // Cache for providers to avoid creating new ones for each balance check
  const [, setProviderCache] = useState({});

  // Cache for last balance fetch time to avoid too frequent fetches
  const [lastFetchTime, setLastFetchTime] = useState({});

  // Bridge state
  const [isBridging, setIsBridging] = useState(false);

  // Bridge modal state
  const [showBridgeModal, setShowBridgeModal] = useState(false);
  const [bridgeModalData, setBridgeModalData] = useState({
    sourceNetwork: null,
    destNetwork: null,
    txHash: null,
    recipientAddress: null,
    initialSourceBalance: '0',
    initialDestBalance: '0',
    bridgeAmount: '0'
  });

  // Get all available networks
  const networks = getAllNetworks();

  // Check if deployments exist
  const deploymentError = getDeploymentErrorMessage();

  // ======== Balance Management ========

  // Fetch token balance for current chain
  const handleFetchTokenBalance = useCallback(async (contract) => {
    const contractToUse = contract || tokenContract;
    await fetchTokenBalance(
      contractToUse,
      address,
      chainId,
      setBalances,
      setIsLoadingBalances
    );
  }, [tokenContract, address, chainId]);

  // Fetch balance for a specific chain
  const handleFetchBalanceForChain = useCallback(async (targetChainId) => {
    await fetchBalanceForChain(
      address,
      targetChainId,
      chainId,
      lastFetchTime,
      setLastFetchTime,
      setBalances,
      setIsLoadingBalances,
      setProviderCache
    );
  }, [address, chainId, lastFetchTime]);

  // ======== Token Contract ========

  // Initialize token contract
  const initTokenContract = useCallback(async (customSigner, customChainId) => {
    const signerToUse = customSigner || signer;
    const chainIdToUse = customChainId || chainId;

    if (!signerToUse || !chainIdToUse || !deploymentsExist()) return;

    const deployment = getDeploymentByChainId(chainIdToUse);
    if (!deployment) {
      console.error(`No deployment found for chain ID ${chainIdToUse}`);
      return;
    }

    try {
      // Create contract instance
      const contract = getTokenContract(deployment.address, signerToUse);
      setTokenContract(contract);

      // Set default token symbol immediately to avoid "Error" display
      setTokenSymbol('MYERC20');

      // Get token symbol with retry mechanism
      const getSymbol = async (retries = 3, delay = 500) => {
        for (let i = 0; i < retries; i++) {
          try {
            // Add a small delay before trying to get the symbol
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, delay));
            }

            const symbol = await contract.symbol();
            setTokenSymbol(symbol);
            return symbol;
          } catch (error) {
            console.warn(`Error getting token symbol (attempt ${i + 1}/${retries}):`, error);
            if (i === retries - 1) {
              console.error('Failed to get token symbol after multiple attempts');
            }
          }
        }
        return 'MYERC20'; // Default fallback
      };

      // Start the symbol fetch process but don't await it
      getSymbol();

      // Fetch balance
      handleFetchTokenBalance(contract);

      return contract;
    } catch (error) {
      console.error('Error initializing contract:', error);
      return null;
    }
  }, [signer, chainId, handleFetchTokenBalance]);

  // ======== Wallet Connection ========

  // Connect to wallet
  const handleConnect = useCallback(async () => {
    try {
      const { signer, address, chainId } = await connectWallet();
      setSigner(signer);
      setAddress(address);
      setChainId(chainId);
      setIsConnected(true);

      // Set up event listeners
      listenForWalletEvents(handleWalletEvent);

      // Find the network key for the current chain ID
      const network = getNetworkByChainId(chainId);
      if (network && network.key) {
        setSourceNetwork(network.key);
      }

      return { signer, address, chainId };
    } catch (error) {
      console.error('Connection error:', error);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle wallet events
  const handleWalletEvent = useCallback(async (event) => {
    if (event.type === 'accountsChanged') {
      if (event.accounts.length === 0) {
        // User disconnected
        setIsConnected(false);
        setAddress('');
        setSigner(null);
        setTokenContract(null);
      } else {
        // User switched accounts
        setAddress(event.accounts[0]);
        handleConnect();
      }
    } else if (event.type === 'chainChanged') {
      // User switched networks
      const newChainId = event.chainId;
      console.log(`Chain changed to ${newChainId}, updating source network`);
      setChainId(newChainId);

      if (isConnected) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const newSigner = await provider.getSigner();
        setSigner(newSigner);

        // Update source network
        const network = getNetworkByChainId(newChainId);
        if (network && network.key) {
          console.log(`Setting source network to ${network.key}`);
          setSourceNetwork(network.key);
        } else {
          console.warn(`No network found for chain ID ${newChainId}`);
        }

        // Initialize contract
        initTokenContract(newSigner, newChainId);
      }
    }
  }, [isConnected, handleConnect, initTokenContract]);

  // ======== Network Management ========

  // Handle source network change
  const handleSourceNetworkChange = useCallback((networkKey) => {
    // If source and dest are the same, reset dest
    if (networkKey === destNetwork) {
      setDestNetwork('');
    }

    // Always update the UI immediately
    setSourceNetwork(networkKey);

    // If we're connected, automatically switch networks
    if (isConnected) {
      const network = networks[networkKey];
      if (network && network.chainId !== Number(chainId)) {
        // Directly switch network without confirmation
        switchNetwork(networkKey).catch(error => {
          console.error('Network switch error:', error);
          // If network switch fails, we might need to revert the UI
          const currentNetwork = getNetworkByChainId(chainId);
          if (currentNetwork && currentNetwork.key) {
            setSourceNetwork(currentNetwork.key);
          }
        });
        // We've already updated the UI, and the chainChanged event
        // will handle any further updates if needed
      }
    }
  }, [isConnected, chainId, networks, destNetwork]);

  // Handle destination network change
  const handleDestNetworkChange = useCallback((networkKey) => {
    setDestNetwork(networkKey);

    // If source and dest are the same, reset source
    if (networkKey === sourceNetwork) {
      setSourceNetwork('');
    }

    // Fetch balance for this network
    if (isConnected && address) {
      handleFetchBalanceForChain(networks[networkKey]?.chainId);
    }
  }, [isConnected, address, networks, sourceNetwork, handleFetchBalanceForChain]);

  // ======== Bridge Modal ========

  // Function to check destination balance for the modal
  const checkDestinationBalance = useCallback(async () => {
    if (!bridgeModalData.destNetwork || !bridgeModalData.recipientAddress) {
      return bridgeModalData.initialDestBalance;
    }

    const destChainId = bridgeModalData.destNetwork.chainId;

    // Fetch the latest balance
    await handleFetchBalanceForChain(destChainId);

    // Return the updated balance
    return balances[destChainId] || '0';
  }, [bridgeModalData, handleFetchBalanceForChain, balances]);

  // Handle modal close
  const handleCloseModal = useCallback(() => {
    setShowBridgeModal(false);
    // Refresh the whole page to reset the app
    window.location.reload();
  }, []);

  // ======== Bridge Tokens ========

  // Helper function to execute the bridge transaction
  const handleBridgeTransaction = useCallback(async (contract, sourceChainId, destChainId, recipient, amount) => {
    try {
      // Get source and destination network info using the passed sourceChainId
      const sourceNetworkObj = getNetworkByChainId(sourceChainId);
      const destNetworkObj = getNetworkByChainId(destChainId);

      // Get current balances before the transaction
      const currentSourceBalance = balances[sourceChainId] || '0';
      const currentDestBalance = balances[destChainId] || '0';

      // Get deployment info for destination chain
      const destDeployment = getDeploymentByChainId(destChainId);

      // First get the transaction object before waiting for confirmation
      const amountWei = ethers.parseEther(amount);
      console.log(`Sending bridge transaction: ${amount} tokens from chain ${sourceChainId} to chain ${destChainId}`);

      const tx = await contract.bridge(destChainId, recipient, amountWei);
      console.log(`Bridge transaction sent: ${tx.hash}`);

      // Show the bridge modal immediately after transaction is sent
      setBridgeModalData({
        sourceNetwork: sourceNetworkObj,
        destNetwork: destNetworkObj,
        txHash: tx.hash,
        recipientAddress: recipient,
        initialSourceBalance: currentSourceBalance,
        initialDestBalance: currentDestBalance,
        tokenAddress: destDeployment?.address,
        bridgeAmount: amount
      });
      setShowBridgeModal(true);

      // Wait for transaction confirmation
      console.log('Waiting for transaction confirmation...');
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

      // Find the BridgeModal component in the DOM and update its state
      const modalElement = document.querySelector('.bridge-modal');
      if (modalElement) {
        // Create a custom event to notify the BridgeModal component
        const event = new CustomEvent('sourceTransactionConfirmed');
        modalElement.dispatchEvent(event);

        // Also update the UI classes directly as a fallback
        const sourceStepElement = modalElement.querySelector('.status-step:first-child');
        if (sourceStepElement) {
          sourceStepElement.classList.add('completed');
          const nextStepElement = modalElement.querySelector('.status-step:nth-child(2)');
          if (nextStepElement) {
            nextStepElement.classList.add('active');
          }
        }
      }

      // Refresh balances
      handleFetchTokenBalance();
      handleFetchBalanceForChain(destChainId);

      // Log the transaction
      const destNetworkName = destNetworkObj?.name || 'destination network';
      console.log(`Tokens will appear on ${destNetworkName} in 3-5 minutes`);

      return tx;
    } catch (error) {
      console.error('Bridge error:', error);
      setShowBridgeModal(false);
      throw error;
    }
  }, [balances, handleFetchTokenBalance, handleFetchBalanceForChain]);

  // Bridge tokens between chains
  const handleBridge = useCallback(async (amount, recipient) => {
    if (!isConnected) {
      console.error('Wallet not connected');
      return;
    }

    if (!sourceNetwork) {
      console.error('Source network not selected');
      return;
    }

    if (!destNetwork) {
      console.error('Destination network not selected');
      return;
    }

    // Get chain IDs
    const sourceChainId = networks[sourceNetwork]?.chainId;
    const destChainId = networks[destNetwork]?.chainId;

    if (!sourceChainId || !destChainId) {
      console.error('Invalid network selection');
      return;
    }

    // Check if networks are the same
    if (sourceChainId === destChainId) {
      console.error('Source and destination networks cannot be the same');
      return;
    }

    setIsBridging(true);

    try {
      // Check if we're on the right network and switch if needed
      if (Number(chainId) !== Number(sourceChainId)) {
        console.log(`Need to switch from chain ${chainId} to ${sourceChainId}`);
        await switchNetwork(sourceNetwork);

        // Wait for React state to update
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check if we're actually on the right network now
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        const currentChainIdNum = parseInt(currentChainId, 16);

        if (currentChainIdNum !== sourceChainId) {
          throw new Error(`Network switch failed. Expected ${sourceChainId}, got ${currentChainIdNum}`);
        }
      }

      // Get the current contract (should be for the correct network now)
      const deployment = getDeploymentByChainId(sourceChainId);
      if (!deployment) {
        throw new Error(`No deployment found for chain ID ${sourceChainId}`);
      }

      // Create fresh provider and contract
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = getTokenContract(deployment.address, signer);

      // Execute bridge transaction
      return await handleBridgeTransaction(contract, sourceChainId, destChainId, recipient || address, amount);

    } catch (error) {
      console.error('Bridge error:', error);
      setIsBridging(false);
      throw error;
    }
  }, [isConnected, sourceNetwork, destNetwork, networks, chainId, address, handleBridgeTransaction]);

  // ======== Effect Hooks ========

  // Single effect for wallet connection and setup
  useEffect(() => {
    // Connect wallet on mount
    const setupWallet = async () => {
      try {
        // Connect wallet
        const { signer, address, chainId } = await connectWallet();
        setSigner(signer);
        setAddress(address);
        setChainId(chainId);
        setIsConnected(true);

        // Set up event listeners
        listenForWalletEvents(handleWalletEvent);

        // Find the network key for the current chain ID
        const network = getNetworkByChainId(chainId);
        if (network && network.key) {
          setSourceNetwork(network.key);
        }

        // Initialize contract
        if (chainId) {
          const deployment = getDeploymentByChainId(chainId);
          if (deployment) {
            const contract = getTokenContract(deployment.address, signer);
            setTokenContract(contract);

            // Fetch balance for current chain
            fetchTokenBalance(
              contract,
              address,
              chainId,
              setBalances,
              setIsLoadingBalances
            );

            // Get token symbol
            try {
              const symbol = await contract.symbol();
              setTokenSymbol(symbol);
            } catch (error) {
              console.warn('Error getting token symbol:', error);
              setTokenSymbol('MYERC20');
            }

            // Fetch balances for all networks
            fetchAllNetworkBalances(address, chainId);
          }
        }
      } catch (error) {
        console.log('Wallet setup failed:', error);
      }
    };

    // Function to fetch balances for all networks
    const fetchAllNetworkBalances = async (userAddress, currentChainId) => {
      if (!userAddress) return;

      // Get all network chain IDs
      const networkEntries = Object.entries(networks);

      // Fetch balances for all networks
      for (const [, network] of networkEntries) {
        const targetChainId = network.chainId;

        // Skip the current chain as we already fetched it
        if (targetChainId === currentChainId) continue;

        // Fetch balance for this chain
        fetchBalanceForChain(
          userAddress,
          targetChainId,
          currentChainId,
          lastFetchTime,
          setLastFetchTime,
          setBalances,
          setIsLoadingBalances,
          setProviderCache
        );
      }
    };

    setupWallet();

    // Set up periodic balance refresh (every 60 seconds)
    const intervalId = setInterval(() => {
      if (address && chainId) {
        // Refresh balances for all networks
        const networkEntries = Object.entries(networks);

        for (const [, network] of networkEntries) {
          const targetChainId = network.chainId;

          // For current chain, use the token contract
          if (targetChainId === chainId && tokenContract) {
            fetchTokenBalance(
              tokenContract,
              address,
              chainId,
              setBalances,
              setIsLoadingBalances
            );
          } else {
            // For other chains, use the RPC provider
            fetchBalanceForChain(
              address,
              targetChainId,
              chainId,
              lastFetchTime,
              setLastFetchTime,
              setBalances,
              setIsLoadingBalances,
              setProviderCache
            );
          }
        }
      }
    }, 60000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // We're using an empty dependency array to avoid re-running this effect
  // ======== Render UI ========

  // If there's a deployment error, show error message
  if (deploymentError) {
    return (
      <div className="bridge-container">
        <div className="bridge-header">
          <h1>Token Bridge</h1>
          <p className="powered-by">Powered by VIA Protocol</p>
        </div>

        <div className="error-container">
          <h2>Deployment Not Found</h2>
          <p>{deploymentError}</p>
          <p>Please run the deployment script first:</p>
          <pre>node scripts/deploy.js</pre>
          <p>This will deploy the token contract to the configured networks and set up cross-chain messaging.</p>
        </div>
      </div>
    );
  }

  // Get current network name
  const currentNetworkName = getNetworkByChainId(chainId)?.name || 'Unknown Network';

  // Get source and destination chain IDs
  const sourceChainId = networks[sourceNetwork]?.chainId;
  const destChainId = networks[destNetwork]?.chainId;

  // Get balances
  const sourceBalance = sourceChainId ? balances[sourceChainId] || '0' : '0';
  const destBalance = destChainId ? balances[destChainId] || '0' : '0';

  // Check if balances are loading
  const isLoadingSourceBalance = sourceChainId ? isLoadingBalances[sourceChainId] : false;
  const isLoadingDestBalance = destChainId ? isLoadingBalances[destChainId] : false;


  return (
    <div className="bridge-container">
      <div className="bridge-header">
        <div className="title-wrapper">
          <h1>Token Bridge</h1>
        </div>
        <div className="wallet-section">
          <h1>Token Bridge</h1>
          <WalletConnect
            isConnected={isConnected}
            address={address}
            chainId={chainId}
            networkName={currentNetworkName}
            onConnect={handleConnect}
          />
        </div>
      </div>

      <div className="bridge-main">
        <div className="bridge-card" style={{ maxHeight: 'fit-content' }}>
          <div className="bridge-form-container">
            <div className="network-selection">
              <div className="source-network">
                {isConnected ? (
                  <>
                    <NetworkSelector
                      networks={networks}
                      currentChainId={chainId}
                      selectedNetwork={sourceNetwork}
                      onNetworkChange={handleSourceNetworkChange}
                      label="Source Network"
                      placeholder="Select source"
                      balances={balances}
                    />
                    <div className="chain-balance">
                      <span className="balance-label">Balance:</span>
                      <span className="balance-amount">
                        {!sourceNetwork ? '-' : isLoadingSourceBalance ? 'Loading...' : `${sourceBalance} ${tokenSymbol}`}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="connect-prompt-mini">
                    Connect wallet to select source network
                  </div>
                )}
              </div>

              <div className="destination-network">
                {isConnected ? (
                  <>
                    <NetworkSelector
                      networks={networks}
                      currentChainId={chainId}
                      selectedNetwork={destNetwork}
                      onNetworkChange={handleDestNetworkChange}
                      label="Destination Network"
                      placeholder="Select destination"
                      balances={balances}
                    />
                    <div className="chain-balance">
                      <span className="balance-label">Balance:</span>
                      <span className="balance-amount">
                        {!destNetwork ? '-' : isLoadingDestBalance ? 'Loading...' : `${destBalance} ${tokenSymbol}`}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="connect-prompt-mini">
                    Connect wallet to select destination
                  </div>
                )}
              </div>
            </div>

            <TokenBridge
              isConnected={isConnected}
              onBridge={handleBridge}
              tokenSymbol={tokenSymbol}
              tokenBalance={sourceBalance}
              isLoading={isBridging}
              sourceNetwork={sourceNetwork ? networks[sourceNetwork]?.name : null}
              destNetwork={destNetwork ? networks[destNetwork]?.name : null}
            />

            <div className="bridge-footer">
              <img src="/logo-black.svg" alt="VIA Protocol" className="via-logo" />
            </div>
          </div>
        </div>
      </div>

      {/* Bridge Modal */}
      <BridgeModal
        isOpen={showBridgeModal}
        onClose={handleCloseModal}
        sourceNetwork={bridgeModalData.sourceNetwork}
        destNetwork={bridgeModalData.destNetwork}
        txHash={bridgeModalData.txHash}
        recipientAddress={bridgeModalData.recipientAddress}
        initialSourceBalance={bridgeModalData.initialSourceBalance}
        initialDestBalance={bridgeModalData.initialDestBalance}
        onCheckDestBalance={checkDestinationBalance}
        tokenAddress={bridgeModalData.tokenAddress}
        bridgeAmount={bridgeModalData.bridgeAmount}
      />
    </div>
  );
}

export default App;
