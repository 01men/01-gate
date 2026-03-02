/**
 * 01门 - 移动端适配模块
 * iOS/Android 轻量级节点客户端
 */

const EventEmitter = require('events');

/**
 * 客户端类型
 */
const ClientType = {
  IOS: 'ios',
  ANDROID: 'android',
  ANDROID_HARMONY: 'harmony'
};

/**
 * 移动端配置
 */
class MobileConfig {
  constructor(options = {}) {
    this.type = options.type || ClientType.IOS;
    this.pushEnabled = options.pushEnabled !== false;
    this.backgroundSync = options.backgroundSync || false;
    this.maxBatteryUsage = options.maxBatteryUsage || 0.1; // 10%
    this.maxStorage = options.maxStorage || 100 * 1024 * 1024; // 100MB
  }
}

/**
 * 推送通知服务
 */
class PushNotificationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.provider = options.provider || 'apns'; // apns, fcm
    this.deviceToken = null;
    this.enabled = true;
  }

  /**
   * 注册设备
   */
  async register(token) {
    this.deviceToken = token;
    console.log(`[Push] 设备已注册: ${this.provider}`);
    return { success: true, provider: this.provider };
  }

  /**
   * 发送通知
   */
  async send(notification) {
    if (!this.enabled || !this.deviceToken) {
      console.warn('[Push] 推送未启用或设备未注册');
      return { success: false, reason: 'not_registered' };
    }

    const payload = this._buildPayload(notification);
    
    // 模拟发送
    console.log(`[Push] 发送通知: ${notification.title}`);
    
    return {
      success: true,
      id: `notif_${Date.now()}`,
      ...payload
    };
  }

  /**
   * 构建通知载荷
   */
  _buildPayload(notification) {
    return {
      to: this.deviceToken,
      notification: {
        title: notification.title,
        body: notification.body,
        sound: 'default',
        badge: notification.badge || 1
      },
      data: notification.data || {},
      priority: notification.priority || 'high'
    };
  }

  /**
   * 处理收到的通知
   */
  handleNotification(notification) {
    this.emit('notification', notification);
    return notification;
  }
}

/**
 * iOS 客户端
 */
class IOSClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = new MobileConfig({ ...options, type: ClientType.IOS });
    this.push = new PushNotificationService({ provider: 'apns' });
    this.isActive = false;
    this.connected = false;
    this.tasks = [];
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('[iOS] 客户端初始化');
    
    // 注册推送
    await this.push.register(process.env.APNS_DEVICE_TOKEN || 'ios_device_token_placeholder');
    
    // 监听推送
    this.push.on('notification', (notif) => this._handleNotification(notif));
    
    this.isActive = true;
    return this;
  }

  /**
   * 处理推送通知
   */
  _handleNotification(notification) {
    console.log(`[iOS] 收到通知: ${notification.title}`);
    
    // 根据通知类型处理
    if (notification.data?.type === 'task_match') {
      this.emit('task:new', notification.data);
    } else if (notification.data?.type === 'task_update') {
      this.emit('task:update', notification.data);
    }
  }

  /**
   * 连接到主节点
   */
  async connect(masterNodeUrl) {
    console.log(`[iOS] 连接到主节点: ${masterNodeUrl}`);
    this.connected = true;
    this.masterNodeUrl = masterNodeUrl;
    return { success: true };
  }

  /**
   * 获取任务列表
   */
  async getTasks() {
    if (!this.connected) {
      throw new Error('未连接到主节点');
    }
    // 模拟获取
    return this.tasks;
  }

  /**
   * 承接任务
   */
  async acceptTask(taskId) {
    console.log(`[iOS] 承接任务: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 提交交付物
   */
  async submitTask(taskId, delivery) {
    console.log(`[iOS] 提交任务: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 断开连接
   */
  async disconnect() {
    this.connected = false;
    console.log('[iOS] 已断开连接');
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      type: 'ios',
      active: this.isActive,
      connected: this.connected,
      pushEnabled: this.push.enabled,
      taskCount: this.tasks.length
    };
  }
}

/**
 * Android 客户端
 */
class AndroidClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = new MobileConfig({ ...options, type: ClientType.ANDROID });
    this.push = new PushNotificationService({ provider: 'fcm' });
    this.isActive = false;
    this.connected = false;
    this.wasmModule = null;
    this.tasks = [];
  }

  /**
   * 初始化
   */
  async initialize() {
    console.log('[Android] 客户端初始化');
    
    // 加载 Wasm 模块
    await this._loadWasmModule();
    
    // 注册推送
    await this.push.register(process.env.FCM_DEVICE_TOKEN || 'android_device_token_placeholder');
    
    this.isActive = true;
    return this;
  }

  /**
   * 加载 Wasm 模块
   */
  async _loadWasmModule() {
    // 模拟 Wasm 加载
    // 生产环境应加载编译好的 .wasm 文件
    this.wasmModule = {
      ready: true,
      version: '1.0.0'
    };
    console.log('[Android] Wasm 模块已加载');
  }

  /**
   * 连接到主节点
   */
  async connect(masterNodeUrl) {
    console.log(`[Android] 连接到主节点: ${masterNodeUrl}`);
    this.connected = true;
    return { success: true };
  }

  /**
   * 间歇性同步（后台任务）
   */
  async sync() {
    if (!this.connected) return;
    
    console.log('[Android] 执行间歇性同步');
    // 模拟同步
    return { synced: true, timestamp: Date.now() };
  }

  /**
   * 获取任务列表
   */
  async getTasks() {
    return this.tasks;
  }

  /**
   * 承接任务
   */
  async acceptTask(taskId) {
    console.log(`[Android] 承接任务: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 提交交付物
   */
  async submitTask(taskId, delivery) {
    console.log(`[Android] 提交任务: ${taskId}`);
    return { success: true, taskId };
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      type: 'android',
      active: this.isActive,
      connected: this.connected,
      wasmReady: this.wasmModule?.ready || false,
      taskCount: this.tasks.length
    };
  }
}

/**
 * 移动端工厂
 */
class MobileClientFactory {
  /**
   * 创建客户端
   */
  static create(type, options = {}) {
    switch (type) {
      case ClientType.IOS:
        return new IOSClient(options);
      case ClientType.ANDROID:
        return new AndroidClient(options);
      case ClientType.ANDROID_HARMONY:
        return new AndroidClient({ ...options, type: ClientType.ANDROID_HARMONY });
      default:
        throw new Error(`未知的客户端类型: ${type}`);
    }
  }

  /**
   * 自动检测平台
   */
  static detect() {
    const platform = process.platform;
    const env = process.env;
    
    if (env.IOS_CLIENT) return ClientType.IOS;
    if (env.ANDROID_CLIENT) return ClientType.ANDROID;
    if (env.HARMONY_CLIENT) return ClientType.ANDROID_HARMONY;
    
    // 默认返回 null，表示非移动端
    return null;
  }
}

/**
 * 轻量级观察者（用于 iOS）
 */
class LightObserver {
  constructor(options = {}) {
    this.masterNodeUrl = options.masterNodeUrl;
    this.push = new PushNotificationService();
    this.isConnected = false;
    this.pendingActions = [];
  }

  /**
   * 连接
   */
  async connect() {
    console.log('[Observer] 连接到主节点');
    this.isConnected = true;
    return { success: true };
  }

  /**
   * 处理任务匹配
   */
  async handleTaskMatch(taskData) {
    // 发送推送通知
    await this.push.send({
      title: '新任务匹配',
      body: `${taskData.title} - 预算: ${taskData.budget}`,
      data: {
        type: 'task_match',
        taskId: taskData.id,
        taskData
      }
    });

    // 存储待处理操作
    this.pendingActions.push({
      type: 'task_match',
      task: taskData,
      timestamp: Date.now()
    });
  }

  /**
   * 执行操作
   */
  async executeAction(action) {
    const { type, taskId, decision } = action;
    
    console.log(`[Observer] 执行操作: ${type}, 决策: ${decision}`);
    
    // 发送到主节点
    if (this.masterNodeUrl) {
      // 模拟发送
    }
    
    return { success: true };
  }

  /**
   * 获取待处理操作
   */
  getPendingActions() {
    return this.pendingActions;
  }

  /**
   * 清空待处理操作
   */
  clearPendingActions() {
    this.pendingActions = [];
  }
}

module.exports = {
  MobileClientFactory,
  MobileConfig,
  PushNotificationService,
  IOSClient,
  AndroidClient,
  LightObserver,
  ClientType
};
