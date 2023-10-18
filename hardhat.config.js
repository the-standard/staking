require('dotenv').config();
require("@nomicfoundation/hardhat-toolbox");
require('hardhat-contract-sizer');
require('solidity-coverage')
require("@nomiclabs/hardhat-etherscan");

const { 
  MAIN_ACCOUNT_PRIVATE_KEY, TEST_ACCOUNT_PRIVATE_KEY, ARBISCAN_KEY, ALCHEMY_ARBITRUM_KEY,
  ALCHEMY_ARBITRUM_GOERLI_KEY
} = process.env;

module.exports = {
  solidity: "0.8.20",
  defaultNetwork: 'hardhat',
  networks: {
    arbitrum_goerli: {
      url: `https://arb-goerli.g.alchemy.com/v2/${ALCHEMY_ARBITRUM_GOERLI_KEY}`,
      accounts: [TEST_ACCOUNT_PRIVATE_KEY]
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_ARBITRUM_KEY}`,
      accounts: [MAIN_ACCOUNT_PRIVATE_KEY]
    }
  },
  etherscan: {
    apiKey: {
      arbitrumGoerli: ARBISCAN_KEY,
      arbitrumOne: ARBISCAN_KEY
    }
  }
};