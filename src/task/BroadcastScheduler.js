/**
 * 01门 - 广播调度器
 * 智能广播 + 重试机制
 */

// 广播间隔表：3 * (N + 6) 小时
const BroadcastSchedule = [
  0,     // 第1次：立即 (0小时)
  21,    // 第2次：3*(1+6)=21小时后
  24,    // 第3次：3*(2+6)=24小时后
  27,    // 第4次：3*(3+6)=27小时后
  33     // 第5次：3*(4+6)=33小时后
];

const MaxBroadcastRetries = 5;

class BroadcastScheduler {
  constructor(options = {}) {
    this.onBroadcast = options.onBroadcast || null;
    this.pendingTasks = new Map(); // taskId -> schedule info
  }

  /**
   * 初始化任务广播
   */
  initialize(task) {
    const info = {
      taskId: task.id,
      broadcastCount: 0,
      status: 'pending',
      lastBroadcast: null,
      nextBroadcast: Date.now()
    };

    this.pendingTasks.set(task.id, info);
    console.log(`[Broadcast] Task ${task.id} initialized, first broadcast immediate`);

    return info;
  }

  /**
   * 获取下次广播延迟（毫秒）
   */
  getNextDelay(broadcastCount) {
    if (broadcastCount >= BroadcastSchedule.length) {
      return null; // 达到最大次数
    }
    return BroadcastSchedule[broadcastCount] * 60 * 60 * 1000;
  }

  /**
   * 执行广播
   */
  async broadcast(taskId) {
    const info = this.pendingTasks.get(taskId);
    if (!info) {
      console.warn(`[Broadcast] Task ${taskId} not found in scheduler`);
      return null;
    }

    if (info.broadcastCount >= MaxBroadcastRetries) {
      info.status = 'failed';
      console.log(`[Broadcast] Task ${taskId} failed: max retries exceeded`);
      return null;
    }

    // 执行广播回调
    if (this.onBroadcast) {
      await this.onBroadcast(taskId, info.broadcastCount + 1);
    }

    // 更新状态
    info.broadcastCount++;
    info.lastBroadcast = Date.now();

    // 计算下次广播时间
    const nextDelay = this.getNextDelay(info.broadcastCount);
    if (nextDelay) {
      info.nextBroadcast = Date.now() + nextDelay;
      info.status = 'scheduled';
      console.log(`[Broadcast] Task ${taskId} broadcast #${info.broadcastCount} done, next in ${nextDelay / 3600000} hours`);
    } else {
      info.status = 'completed';
      info.nextBroadcast = null;
      console.log(`[Broadcast] Task ${taskId} completed all broadcasts`);
    }

    this.pendingTasks.set(taskId, info);
    return info;
  }

  /**
   * 检查是否有需要广播的任务
   */
  getPendingBroadcasts() {
    const now = Date.now();
    const pending = [];

    for (const [taskId, info] of this.pendingTasks) {
      if (info.status === 'pending' || (info.status === 'scheduled' && now >= info.nextBroadcast)) {
        pending.push({
          taskId,
          ...info,
          shouldBroadcast: info.status === 'pending' || now >= info.nextBroadcast
        });
      }
    }

    return pending;
  }

  /**
   * 获取任务广播信息
   */
  getTaskInfo(taskId) {
    return this.pendingTasks.get(taskId);
  }

  /**
   * 添加小费并重新激活广播
   */
  addTipAndReactivate(taskId, tipAmount) {
    const info = this.pendingTasks.get(taskId);
    if (!info) return null;

    // 重置广播计数，允许重新广播
    info.broadcastCount = 0;
    info.status = 'pending';
    info.tipAmount = tipAmount;
    info.nextBroadcast = Date.now();

    this.pendingTasks.set(taskId, info);
    console.log(`[Broadcast] Task ${taskId} reactivated with tip: ${tipAmount}`);

    return info;
  }

  /**
   * 启动调度器
   */
  start(intervalMs = 60000) {
    console.log(`[Broadcast] Scheduler started, checking every ${intervalMs}ms`);

    this.timer = setInterval(async () => {
      const pending = this.getPendingBroadcasts();

      for (const task of pending) {
        if (task.shouldBroadcast) {
          await this.broadcast(task.taskId);
        }
      }
    }, intervalMs);

    return this;
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      console.log(`[Broadcast] Scheduler stopped`);
    }
  }
}

module.exports = { BroadcastScheduler, BroadcastSchedule, MaxBroadcastRetries };
