/**
 * TokenBalance Component
 * ======================
 * 
 * This component displays the user's token balance for the current network.
 * It shows:
 * - The token balance with the token symbol
 * - A loading state when the balance is being fetched
 * - A message when the wallet is not connected
 */

import React from 'react';

function TokenBalance({ isConnected, balance, symbol, isLoading }) {
  const formatBalance = (balanceStr) => {
    if (balanceStr === 'Error') return 'Error loading balance';
    
    // If the balance has more than 6 decimal places, truncate it
    const balanceNum = parseFloat(balanceStr);
    if (isNaN(balanceNum)) return balanceStr;
    
    // Format with commas for thousands and limit to 6 decimal places
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6
    }).format(balanceNum);
  };
  
  return (
    <div className="card">
      <h2>Token Balance</h2>
      {isConnected ? (
        isLoading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading balance...</p>
          </div>
        ) : (
          <div className="balance-container">
            <h3 className="balance-amount">{formatBalance(balance)} <span className="token-symbol">{symbol}</span></h3>
            <p className="balance-info">
              This is your current token balance on this network. 
              To bridge tokens to another network, use the Bridge Tokens section below.
            </p>
            <div className="balance-note">
              <strong>Note:</strong> Each network has its own token balance. 
              Switch networks to see your balance on other chains.
            </div>
          </div>
        )
      ) : (
        <p>Connect your wallet to view your token balance.</p>
      )}
    </div>
  );
}

export default TokenBalance;
