/**
 * Bridge Transaction Modal Component
 * ==================================
 * 
 * This component displays a modal overlay that shows the status of a bridge transaction.
 * It tracks the progress of the transaction through different states:
 * 1. Confirming source transaction
 * 2. Waiting for destination chain
 * 3. Success
 * 
 * It also provides links to explorers for both source and destination chains.
 */

import React, { useState, useEffect } from 'react';

function BridgeModal({ 
  isOpen, 
  onClose, 
  sourceNetwork, 
  destNetwork, 
  txHash, 
  recipientAddress,
  initialDestBalance,
  onCheckDestBalance,
  tokenAddress,
  bridgeAmount
}) {
  // Transaction states
  const [status, setStatus] = useState('confirming-source');
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [destConfirmed, setDestConfirmed] = useState(false);
  
  // Balance tracking
  const [destBalance, setDestBalance] = useState(initialDestBalance);
  const [sourceConfirmTime, setSourceConfirmTime] = useState(null);
  
  // Effect to check destination balance periodically
  useEffect(() => {
    if (!isOpen || !sourceConfirmed) return;
    
    // If source is confirmed but destination is not, start checking destination balance
    const intervalId = setInterval(async () => {
      if (onCheckDestBalance) {
        // Only start checking after source transaction has been confirmed for at least 10 seconds
        // This gives time for the bridge process to begin
        const now = Date.now();
        if (sourceConfirmTime && (now - sourceConfirmTime < 10000)) {
          console.log("Waiting for bridge process to begin...");
          return;
        }
        
        const newBalance = await onCheckDestBalance();
        setDestBalance(newBalance);
        
        // If balance has increased, mark destination as confirmed
        if (parseFloat(newBalance) > parseFloat(initialDestBalance)) {
          setDestConfirmed(true);
          setStatus('success');
          clearInterval(intervalId);
        }
      }
    }, 5000); // Check every 5 seconds for more responsive feedback
    
    return () => clearInterval(intervalId);
  }, [isOpen, sourceConfirmed, initialDestBalance, onCheckDestBalance]);
  
  // Effect to update status when source is confirmed
  useEffect(() => {
    if (sourceConfirmed && !destConfirmed) {
      setStatus('waiting-destination');
      setSourceConfirmTime(Date.now());
    }
  }, [sourceConfirmed, destConfirmed]);
  
  // Effect to listen for the custom event from App.js
  useEffect(() => {
    if (!isOpen) return;
    
    const modalElement = document.querySelector('.bridge-modal');
    if (!modalElement) return;
    
    const handleSourceConfirmed = () => {
      setSourceConfirmed(true);
      setStatus('waiting-destination');
    };
    
    modalElement.addEventListener('sourceTransactionConfirmed', handleSourceConfirmed);
    
    return () => {
      modalElement.removeEventListener('sourceTransactionConfirmed', handleSourceConfirmed);
    };
  }, [isOpen]);
  
  // If modal is not open, don't render anything
  if (!isOpen) return null;
  
  // Get chain logo URLs
  const sourceChainId = sourceNetwork?.chainId;
  const destChainId = destNetwork?.chainId;
  const sourceLogoUrl = sourceChainId ? `https://scan.vialabs.io/images/logos/chains/${sourceChainId}.png` : null;
  const destLogoUrl = destChainId ? `https://scan.vialabs.io/images/logos/chains/${destChainId}.png` : null;
  
  // Generate explorer URLs
  const viaExplorerUrl = txHash ? `https://scan.vialabs.io/transaction/${txHash}` : null;
  const sourceExplorerUrl = sourceNetwork?.blockExplorer && txHash ? `${sourceNetwork.blockExplorer}/tx/${txHash}` : null;
  const destTokenExplorerUrl = destNetwork?.blockExplorer && recipientAddress && tokenAddress ? 
    `${destNetwork.blockExplorer}/address/${recipientAddress}/tokentxns?tokenaddresses=${tokenAddress}` : null;
  
  return (
    <div className="bridge-modal-overlay">
      <div className="bridge-modal">
        <div className="bridge-modal-header">
          <h3>Bridge Transaction Status</h3>
          <button className="modal-close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="bridge-modal-content">
          {/* Networks display */}
          <div className="bridge-networks">
            <div className="bridge-network source">
              <div className="network-logo">
                {sourceLogoUrl ? (
                  <img src={sourceLogoUrl} alt={sourceNetwork?.name} />
                ) : (
                  <div className="network-logo-placeholder">{sourceNetwork?.name?.charAt(0)}</div>
                )}
              </div>
              <div className="network-name">{sourceNetwork?.name}</div>
            </div>
            
            <div className="bridge-direction">→</div>
            
            <div className="bridge-network destination">
              <div className="network-logo">
                {destLogoUrl ? (
                  <img src={destLogoUrl} alt={destNetwork?.name} />
                ) : (
                  <div className="network-logo-placeholder">{destNetwork?.name?.charAt(0)}</div>
                )}
              </div>
              <div className="network-name">{destNetwork?.name}</div>
            </div>
          </div>
          
          {/* Status steps */}
          <div className="bridge-status-steps">
            <div className={`status-step ${status === 'confirming-source' ? 'active' : ''} ${sourceConfirmed ? 'completed' : ''}`}>
              <div className="step-indicator">
                {sourceConfirmed ? '✓' : '1'}
              </div>
              <div className="step-content">
                <div className="step-title">Confirming Source Transaction</div>
                <div className="step-description">
                  {sourceConfirmed 
                    ? 'Transaction confirmed on source chain' 
                    : 'Waiting for transaction confirmation...'}
                </div>
              </div>
            </div>
            
            <div className={`status-step ${status === 'waiting-destination' ? 'active' : ''} ${destConfirmed ? 'completed' : ''}`}>
              <div className="step-indicator">
                {destConfirmed ? '✓' : status === 'waiting-destination' ? (
                  <div className="spinner-icon">⟳</div>
                ) : '2'}
              </div>
              <div className="step-content">
                <div className="step-title">Waiting for Destination Chain</div>
                <div className="step-description">
                  {destConfirmed 
                    ? 'Tokens received on destination chain' 
                    : sourceConfirmed 
                      ? 'Waiting for tokens to arrive on destination chain...' 
                      : 'Waiting for source transaction to confirm first...'}
                </div>
              </div>
            </div>
            
            <div className={`status-step ${status === 'success' ? 'active' : ''}`}>
              <div className="step-indicator">
                {destConfirmed ? '✓' : ''}
              </div>
              <div className="step-content">
                <div className="step-title">Bridge Complete</div>
                <div className="step-description">
                  {destConfirmed 
                    ? 'Bridge transaction completed successfully!' 
                    : 'Waiting for previous steps to complete...'}
                </div>
              </div>
            </div>
          </div>
          
          {/* Explorer links */}
          {(sourceConfirmed || destConfirmed) && (
            <div className="bridge-explorer-links">
              <h4>Transaction Details</h4>
              
              {viaExplorerUrl && (
                <a 
                  href={viaExplorerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="explorer-link"
                >
                  View on VIA Explorer
                </a>
              )}
              
              {sourceExplorerUrl && (
                <a 
                  href={sourceExplorerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="explorer-link"
                >
                  View Source Transaction
                </a>
              )}
              
              {destTokenExplorerUrl && destConfirmed && (
                <a 
                  href={destTokenExplorerUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="explorer-link"
                >
                  View Tokens on Destination Chain
                </a>
              )}
            </div>
          )}
        </div>
        
        <div className="bridge-modal-footer">
          {destConfirmed ? (
            <button className="bridge-modal-button success" onClick={onClose}>
              Close
            </button>
          ) : (
            <div className="bridge-modal-status">
              {status === 'confirming-source' && 'Confirming transaction...'}
              {status === 'waiting-destination' && 'Waiting for tokens to arrive...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BridgeModal;
