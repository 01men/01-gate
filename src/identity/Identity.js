/**
 * 01门 - 核心身份模块
 * 基于公私钥对的去中心化身份 (DID)
 */

const { ethers } = require('ethers');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class Identity {
  constructor(options = {}) {
    this.privateKey = options.privateKey || null;
    this.publicKey = options.publicKey || null;
    this.address = options.address || null;
    this.did = options.did || null;
    this.metadata = options.metadata || {};
  }

  /**
   * 生成新的身份
   */
  static generate() {
    const wallet = ethers.Wallet.createRandom();
    return new Identity({
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      address: wallet.address,
      did: `did:01gate:${wallet.address.toLowerCase()}`
    });
  }

  /**
   * 从私钥加载身份
   */
  static fromPrivateKey(privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return new Identity({
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
        address: wallet.address,
        did: `did:01gate:${wallet.address.toLowerCase()}`
      });
    } catch (e) {
      throw new Error(`Invalid private key: ${e.message}`);
    }
  }

  /**
   * 从助记词生成身份
   */
  static fromMnemonic(mnemonic) {
    try {
      const wallet = ethers.Wallet.fromMnemonic(mnemonic);
      return new Identity({
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
        address: wallet.address,
        did: `did:01gate:${wallet.address.toLowerCase()}`
      });
    } catch (e) {
      throw new Error(`Invalid mnemonic: ${e.message}`);
    }
  }

  /**
   * 签名
   */
  sign(message) {
    if (!this.privateKey) {
      throw new Error('No private key available');
    }
    const wallet = new ethers.Wallet(this.privateKey);
    return wallet.signMessage(message);
  }

  /**
   * 验证签名
   */
  static verify(message, signature, address) {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch (e) {
      return false;
    }
  }

  /**
   * 导出JSON
   */
  toJSON() {
    return {
      did: this.did,
      address: this.address,
      publicKey: this.publicKey,
      // 注意：私钥需要妥善保管
      privateKey: this.privateKey,
      metadata: this.metadata
    };
  }

  /**
   * 保存到文件
   */
  save(filepath) {
    fs.writeFileSync(filepath, JSON.stringify(this.toJSON(), null, 2));
  }

  /**
   * 从文件加载
   */
  static load(filepath) {
    if (!fs.existsSync(filepath)) {
      return null;
    }
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return new Identity(data);
    } catch (e) {
      return null;
    }
  }
}

module.exports = { Identity };
