/**
 * TokenBridge Component
 * =====================
 * 
 * This component provides the interface for bridging tokens between networks.
 * It allows users to:
 * - Specify an amount to bridge
 * - Optionally specify a recipient address
 * - Submit the bridge transaction
 */

import React, { useState } from 'react';

function TokenBridge({ 
  isConnected, 
  onBridge, 
  tokenSymbol, 
  tokenBalance,
  isLoading,
  sourceNetwork,
  destNetwork
}) {
  // Form state
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [error, setError] = useState('');
  
  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Reset error
    setError('');
    
    // Validate form
    if (!amount) {
      setError('Please enter an amount to bridge');
      return;
    }
    
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    
    if (!sourceNetwork) {
      setError('Please select a source network');
      return;
    }
    
    if (!destNetwork) {
      setError('Please select a destination network');
      return;
    }
    
    // Validate recipient address if provided
    if (recipient && !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setError('Please enter a valid Ethereum address (0x...)');
      return;
    }
    
    // Call the bridge function
    onBridge(amount, recipient);
  };
  
  // Handle max button click
  const handleMaxClick = () => {
    setAmount(tokenBalance);
  };
  
  return (
    <div className="bridge-token-form">
      {isConnected ? (
        <form onSubmit={handleSubmit}>
          <div className="token-amount-container">
            <div className="token-input-wrapper">
              <label htmlFor="amount">Amount</label>
              <div className="token-input-group">
                <input
                  type="text"
                  id="amount"
                  className="token-amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.0"
                  disabled={isLoading}
                />
                <div className="token-symbol-display">
                  <span>{tokenSymbol}</span>
                </div>
              </div>
              <div className="balance-actions">
                <span className="available-balance">
                  Available: {tokenBalance} {tokenSymbol}
                </span>
                <button 
                  type="button" 
                  className="max-button"
                  onClick={handleMaxClick}
                  disabled={isLoading}
                >
                  MAX
                </button>
              </div>
            </div>
          </div>
          
          {/* Recipient address input */}
          <div className="recipient-input">
            <label htmlFor="recipient">Recipient Address (optional)</label>
            <input
              type="text"
              id="recipient"
              className="address-input"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x... (leave empty to send to yourself)"
              disabled={isLoading}
            />
          </div>
          
          {/* Error message */}
          {error && (
            <div className="bridge-error-message">
              {error}
            </div>
          )}
          
          {/* Submit button */}
          <button
            type="submit"
            className="bridge-button"
            disabled={isLoading || !amount || !sourceNetwork || !destNetwork}
          >
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                Bridging...
              </>
            ) : (
              'Bridge Tokens'
            )}
          </button>
        </form>
      ) : (
        <div className="connect-prompt-bridge">
          <p>Connect your wallet to bridge tokens</p>
        </div>
      )}
    </div>
  );
}

export default TokenBridge;
