/**
 * 01门 - 钱包集成模块
 * 支持多种钱包连接
 */

const { ethers } = require('ethers');

// 钱包类型
const WalletType = {
  METAMASK: 'metamask',
  WALLETCONNECT: 'walletconnect',
  PRIVATE_KEY: 'private_key',
  MNEMONIC: 'mnemonic',
  HARDWARE: 'hardware'
};

/**
 * 浏览器钱包 (MetaMask)
 */
class BrowserWallet {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    this.isConnected = false;
  }

  /**
   * 连接钱包
   */
  async connect() {
    if (typeof window === 'undefined') {
      throw new Error('Browser environment required');
    }

    if (!window.ethereum) {
      throw new Error('MetaMask not installed');
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    
    try {
      await this.provider.send('eth_requestAccounts', []);
      const accounts = await this.provider.listAccounts();
      
      if (accounts.length > 0) {
        this.signer = accounts[0];
        this.address = await this.signer.getAddress();
        this.isConnected = true;
        
        // 获取链ID
        const network = await this.provider.getNetwork();
        this.chainId = network.chainId;
        
        console.log(`[Wallet] Connected: ${this.address}`);
        
        // 监听账户变化
        window.ethereum.on('accountsChanged', (accounts) => {
          if (accounts.length === 0) {
            this.disconnect();
          } else {
            this.address = accounts[0];
          }
        });
        
        return this;
      }
    } catch (e) {
      throw new Error('Failed to connect: ' + e.message);
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.signer = null;
    this.address = null;
    this.isConnected = false;
    console.log('[Wallet] Disconnected');
  }

  /**
   * 签名消息
   */
  async signMessage(message) {
    if (!this.signer) throw new Error('Not connected');
    return await this.signer.signMessage(message);
  }

  /**
   * 发送交易
   */
  async sendTransaction(tx) {
    if (!this.signer) throw new Error('Not connected');
    return await this.signer.sendTransaction(tx);
  }

  /**
   * 获取余额
   */
  async getBalance(tokenAddress = null) {
    if (!this.address) throw new Error('Not connected');
    
    if (!tokenAddress) {
      return await this.provider.getBalance(this.address);
    }
    
    // ERC20 代币余额
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, abi, this.provider);
    return await contract.balanceOf(this.address);
  }

  /**
   * 切换网络
   */
  async switchChain(chainId) {
    if (!window.ethereum) throw new Error('MetaMask not found');
    
    const chainIdHex = `0x${chainId.toString(16)}`;
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }]
      });
    } catch (e) {
      // 链未添加
      throw new Error('Chain not found. Please add it to MetaMask.');
    }
  }

  /**
   * 获取网络信息
   */
  async getNetwork() {
    if (!this.provider) return null;
    return await this.provider.getNetwork();
  }
}

/**
 * 私钥钱包
 */
class PrivateKeyWallet {
  constructor(privateKey, providerUrl = null) {
    this.provider = providerUrl 
      ? new ethers.JsonRpcProvider(providerUrl)
      : ethers.getDefaultProvider();
    
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
  }

  /**
   * 获取签名者
   */
  getSigner() {
    return this.wallet;
  }

  /**
   * 签名消息
   */
  async signMessage(message) {
    return await this.wallet.signMessage(message);
  }

  /**
   * 发送交易
   */
  async sendTransaction(tx) {
    return await this.wallet.sendTransaction(tx);
  }

  /**
   * 获取余额
   */
  async getBalance(tokenAddress = null) {
    if (!tokenAddress) {
      return await this.provider.getBalance(this.address);
    }
    
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, abi, this.provider);
    return await contract.balanceOf(this.address);
  }
}

/**
 * 助记词钱包
 */
class MnemonicWallet {
  constructor(mnemonic, providerUrl = null, path = "m/44'/60'/0'/0/0") {
    this.provider = providerUrl
      ? new ethers.JsonRpcProvider(providerUrl)
      : ethers.getDefaultProvider();
    
    this.wallet = ethers.Wallet.fromMnemonic(mnemonic, path);
    this.wallet = this.wallet.connect(this.provider);
    this.address = this.wallet.address;
    this.mnemonic = mnemonic;
  }

  /**
   * 从派生子钱包
   */
  deriveChild(index) {
    const path = `m/44'/60'/0'/0/${index}`;
    return new MnemonicWallet(this.mnemonic, null, path);
  }

  getSigner() {
    return this.wallet;
  }

  async signMessage(message) {
    return await this.wallet.signMessage(message);
  }

  async sendTransaction(tx) {
    return await this.wallet.sendTransaction(tx);
  }

  async getBalance(tokenAddress = null) {
    if (!tokenAddress) {
      return await this.provider.getBalance(this.address);
    }
    
    const abi = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(tokenAddress, abi, this.provider);
    return await contract.balanceOf(this.address);
  }
}

/**
 * 合约交互
 */
class ContractWrapper {
  constructor(wallet, contractAddress, abi) {
    this.wallet = wallet;
    this.address = contractAddress;
    this.contract = new ethers.Contract(contractAddress, abi, wallet.getSigner ? wallet.getSigner() : wallet);
  }

  /**
   * 调用只读方法
   */
  async read(method, ...args) {
    return await this.contract[method](...args);
  }

  /**
   * 发送交易
   */
  async write(method, ...args) {
    const tx = await this.contract[method](...args);
    return await tx.wait();
  }

  /**
   * 监听事件
   */
  on(event, callback) {
    this.contract.on(event, callback);
  }

  /**
   * 获取合约地址
   */
  getAddress() {
    return this.address;
  }
}

/**
 * 钱包管理器
 */
class WalletManager {
  constructor() {
    this.currentWallet = null;
    this.walletType = null;
  }

  /**
   * 连接浏览器钱包
   */
  async connectBrowser() {
    const wallet = new BrowserWallet();
    await wallet.connect();
    
    this.currentWallet = wallet;
    this.walletType = WalletType.METAMASK;
    
    return wallet;
  }

  /**
   * 使用私钥连接
   */
  connectPrivateKey(privateKey, providerUrl = null) {
    const wallet = new PrivateKeyWallet(privateKey, providerUrl);
    
    this.currentWallet = wallet;
    this.walletType = WalletType.PRIVATE_KEY;
    
    return wallet;
  }

  /**
   * 使用助记词连接
   */
  connectMnemonic(mnemonic, providerUrl = null) {
    const wallet = new MnemonicWallet(mnemonic, providerUrl);
    
    this.currentWallet = wallet;
    this.walletType = WalletType.MNEMONIC;
    
    return wallet;
  }

  /**
   * 获取当前钱包
   */
  getWallet() {
    return this.currentWallet;
  }

  /**
   * 获取当前类型
   */
  getType() {
    return this.walletType;
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.currentWallet?.disconnect) {
      this.currentWallet.disconnect();
    }
    this.currentWallet = null;
    this.walletType = null;
  }

  /**
   * 创建合约包装器
   */
  wrapContract(contractAddress, abi) {
    if (!this.currentWallet) {
      throw new Error('No wallet connected');
    }
    
    return new ContractWrapper(this.currentWallet, contractAddress, abi);
  }
}

// ERC20 代币 ABI
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function transferFrom(address, address, uint256) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

// 常用代币地址
const COMMON_TOKENS = {
  ETH: { address: null, decimals: 18, symbol: 'ETH' },
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, symbol: 'USDC' },
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, symbol: 'USDT' },
  DAI: { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, symbol: 'DAI' }
};

module.exports = {
  WalletManager,
  BrowserWallet,
  PrivateKeyWallet,
  MnemonicWallet,
  ContractWrapper,
  WalletType,
  ERC20_ABI,
  COMMON_TOKENS
};
