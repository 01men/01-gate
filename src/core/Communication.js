/**
 * 01门 - 端到端加密通信模块
 * Agent间安全沟通
 */

const crypto = require('crypto');
const EventEmitter = require('events');

// 消息类型
const MessageType = {
  TASK_REQUEST: 'task_request',
  TASK_RESPONSE: 'task_response',
  PROGRESS_UPDATE: 'progress_update',
  QUESTION: 'question',
  ANSWER: 'answer',
  DELIVERY: 'delivery',
  REVIEW: 'review',
  SYSTEM: 'system'
};

// 消息状态
const MessageStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

/**
 * 加密消息
 */
class EncryptedMessage {
  constructor(options = {}) {
    this.id = options.id || crypto.randomUUID();
    this.type = options.type;
    this.sender = options.sender;
    this.recipient = options.recipient;
    this.taskId = options.taskId;
    this.content = options.content;
    this.encryptedContent = options.encryptedContent || null;
    this.iv = options.iv || null;
    this.status = options.status || MessageStatus.PENDING;
    this.timestamp = options.timestamp || Date.now();
    this.readAt = options.readAt || null;
    this.metadata = options.metadata || {};
  }

  /**
   * 加密消息内容
   */
  encrypt(sharedKey) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', sharedKey, iv);
    
    let encrypted = cipher.update(this.content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    this.encryptedContent = encrypted;
    this.iv = iv.toString('hex');
    this.metadata.authTag = authTag;
    
    return {
      encryptedContent: encrypted,
      iv: iv.toString('hex'),
      authTag
    };
  }

  /**
   * 解密消息内容
   */
  decrypt(sharedKey) {
    if (!this.encryptedContent || !this.iv) {
      throw new Error('消息未加密');
    }

    const iv = Buffer.from(this.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', sharedKey, iv);
    decipher.setAuthTag(Buffer.from(this.metadata.authTag, 'hex'));
    
    let decrypted = decipher.update(this.encryptedContent, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      sender: this.sender,
      recipient: this.recipient,
      taskId: this.taskId,
      encryptedContent: this.encryptedContent,
      iv: this.iv,
      status: this.status,
      timestamp: this.readAt,
      metadata: this.metadata
    };
  }
}

/**
 * 安全通道
 */
class SecureChannel extends EventEmitter {
  constructor(options = {}) {
    super();
    this.localDid = options.localDid;
    this.remoteDid = options.remoteDid;
    this.taskId = options.taskId;
    this.localKeyPair = options.localKeyPair; // { publicKey, privateKey }
    this.remotePublicKey = options.remotePublicKey;
    this.sharedKey = null;
    this.messages = new Map();
    this.status = 'initializing';
  }

  /**
   * 生成共享密钥
   */
  async generateSharedKey() {
    // ECDH 密钥交换
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(this.localKeyPair.privateKey, 'hex'));
    
    this.sharedKey = ecdh.computeSecret(
      Buffer.from(this.remotePublicKey, 'hex')
    );
    
    // 派生 AES 密钥
    const derived = crypto.pbkdf2Sync(this.sharedKey, '01gate', 100000, 32, 'sha256');
    this.sharedKey = derived;
    
    this.status = 'ready';
    console.log(`[SecureChannel] 通道已建立: ${this.localDid} <-> ${this.remoteDid}`);
    
    return this.sharedKey;
  }

  /**
   * 发送加密消息
   */
  send(type, content, metadata = {}) {
    const message = new EncryptedMessage({
      type,
      sender: this.localDid,
      recipient: this.remoteDid,
      taskId: this.taskId,
      content: JSON.stringify(content)
    });

    if (!this.sharedKey) {
      throw new Error('通道未就绪');
    }

    message.encrypt(this.sharedKey);
    this.messages.set(message.id, message);
    
    this.emit('message:sent', message);
    console.log(`[SecureChannel] 消息已发送: ${message.type}`);
    
    return message;
  }

  /**
   * 接收并解密消息
   */
  receive(encryptedData) {
    const message = new EncryptedMessage({
      ...encryptedData,
      content: '' // 将被解密替换
    });

    try {
      const decrypted = message.decrypt(this.sharedKey);
      message.content = JSON.parse(decrypted);
      this.messages.set(message.id, message);
      
      this.emit('message:received', message);
      return message;
    } catch (e) {
      console.error(`[SecureChannel] 解密失败:`, e.message);
      return null;
    }
  }

  /**
   * 获取消息历史
   */
  getHistory(limit = 50) {
    const msgs = Array.from(this.messages.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    return msgs.slice(-limit);
  }

  /**
   * 标记为已读
   */
  markAsRead(messageId) {
    const message = this.messages.get(messageId);
    if (message) {
      message.status = MessageStatus.READ;
      message.readAt = Date.now();
    }
  }
}

/**
 * 通信服务
 */
class CommunicationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.localDid = options.localDid;
    this.keyPair = options.keyPair || this._generateKeyPair();
    this.channels = new Map(); // taskId -> SecureChannel
    this.peerPublicKeys = new Map(); // did -> publicKey
    this.messageQueue = [];
  }

  /**
   * 生成密钥对
   */
  _generateKeyPair() {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    
    return {
      publicKey: ecdh.getPublicKey('hex'),
      privateKey: ecdh.getPrivateKey('hex')
    };
  }

  /**
   * 注册对等方公钥
   */
  registerPeer(peerDid, publicKey) {
    this.peerPublicKeys.set(peerDid, publicKey);
    console.log(`[Comm] 已注册对等方: ${peerDid}`);
  }

  /**
   * 建立安全通道
   */
  async createChannel(taskId, remoteDid) {
    const remotePublicKey = this.peerPublicKeys.get(remoteDid);
    if (!remotePublicKey) {
      throw new Error(`未找到对等方公钥: ${remoteDid}`);
    }

    const channel = new SecureChannel({
      localDid: this.localDid,
      remoteDid,
      taskId,
      localKeyPair: this.keyPair,
      remotePublicKey
    });

    await channel.generateSharedKey();
    this.channels.set(taskId, channel);

    // 事件转发
    channel.on('message:sent', (msg) => this.emit('message:sent', msg));
    channel.on('message:received', (msg) => this.emit('message:received', msg));

    return channel;
  }

  /**
   * 获取或创建通道
   */
  getChannel(taskId) {
    return this.channels.get(taskId);
  }

  /**
   * 发送任务请求
   */
  async sendTaskRequest(taskId, remoteDid, taskData) {
    let channel = this.channels.get(taskId);
    
    if (!channel) {
      channel = await this.createChannel(taskId, remoteDid);
    }

    return channel.send(MessageType.TASK_REQUEST, {
      task: taskData,
      timestamp: Date.now()
    });
  }

  /**
   * 发送进度更新
   */
  async sendProgressUpdate(taskId, remoteDid, progress) {
    const channel = this.channels.get(taskId);
    if (!channel) {
      throw new Error('通道不存在');
    }

    return channel.send(MessageType.PROGRESS_UPDATE, {
      progress,
      timestamp: Date.now()
    });
  }

  /**
   * 发送交付物
   */
  async sendDelivery(taskId, remoteDid, delivery) {
    const channel = this.channels.get(taskId);
    if (!channel) {
      throw new Error('通道不存在');
    }

    return channel.send(MessageType.DELIVERY, {
      delivery,
      timestamp: Date.now()
    });
  }

  /**
   * 发送验收意见
   */
  async sendReview(taskId, remoteDid, review) {
    const channel = this.channels.get(taskId);
    if (!channel) {
      throw new Error('通道不存在');
    }

    return channel.send(MessageType.REVIEW, {
      review,
      timestamp: Date.now()
    });
  }

  /**
   * 处理收到的加密消息
   */
  handleIncomingMessage(encryptedData) {
    const taskId = encryptedData.taskId;
    const channel = this.channels.get(taskId);
    
    if (!channel) {
      console.warn(`[Comm] 未知任务通道: ${taskId}`);
      return null;
    }

    return channel.receive(encryptedData);
  }

  /**
   * 获取通道列表
   */
  getChannels() {
    return Array.from(this.channels.values());
  }

  /**
   * 获取公钥（供其他节点使用）
   */
  getPublicKey() {
    return this.keyPair.publicKey;
  }
}

module.exports = {
  EncryptedMessage,
  SecureChannel,
  CommunicationService,
  MessageType,
  MessageStatus
};
