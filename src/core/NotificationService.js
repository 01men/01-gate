/**
 * 01门 - 通知服务
 * 邮件 + 推送通知
 */

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('[Notify] nodemailer not installed, using mock mode');
}

class NotificationService {
  constructor(options = {}) {
    this.transporter = null;
    this.fromEmail = options.fromEmail || 'noreply@01gate.io';
    this.pushService = options.pushService || null;
    
    // 邮件配置
    if (options.smtp && nodemailer) {
      this.transporter = nodemailer.createTransport(options.smtp);
    }
    
    // 通知队列
    this.queue = [];
    this.processing = false;
  }

  /**
   * 发送任务通知给人类
   */
  async notifyNewTask(humanEmail, task) {
    const subject = `🔔 新任务邀请: ${task.title}`;
    const html = this._renderTaskEmail(task);
    
    return this.sendEmail(humanEmail, subject, html);
  }

  /**
   * 发送任务被承接通知
   */
  async notifyTaskAccepted(requesterEmail, task, acceptorDID) {
    const subject = `✅ 任务已承接: ${task.title}`;
    const html = `
      <h2>任务已承接</h2>
      <p>任务 "<strong>${task.title}</strong>" 已被承接。</p>
      <p>承接方: ${acceptorDID}</p>
      <p>预算: ${task.budget} ${task.token}</p>
      <p>截止日期: ${new Date(task.deadline).toLocaleString()}</p>
    `;
    
    return this.sendEmail(requesterEmail, subject, html);
  }

  /**
   * 发送任务完成通知
   */
  async notifyTaskCompleted(requesterEmail, task) {
    const subject = `📦 任务待验收: ${task.title}`;
    const html = `
      <h2>任务已提交</h2>
      <p>任务 "<strong>${task.title}</strong>" 已完成并提交。</p>
      <p>请登录系统进行验收。</p>
      <p><a href="https://01gate.io/task/${task.id}">查看任务</a></p>
    `;
    
    return this.sendEmail(requesterEmail, subject, html);
  }

  /**
   * 发送验收通过通知
   */
  async notifyTaskApproved(acceptorEmail, task) {
    const subject = `🎉 任务验收通过: ${task.title}`;
    const html = `
      <h2>恭喜！任务验收通过</h2>
      <p>任务 "<strong>${task.title}</strong>" 已通过验收。</p>
      <p>您将获得: ${task.budget} ${task.token}</p>
      <p>信誉分 +${Math.min(task.budget, 10)}</p>
    `;
    
    return this.sendEmail(acceptorEmail, subject, html);
  }

  /**
   * 发送争议通知
   */
  async notifyDispute(participantEmail, task, reason) {
    const subject = `⚠️ 任务争议: ${task.title}`;
    const html = `
      <h2>任务发生争议</h2>
      <p>任务 "<strong>${task.title}</strong>" 发生了争议。</p>
      <p>原因: ${reason}</p>
      <p>请登录系统参与仲裁。</p>
    `;
    
    return this.sendEmail(participantEmail, subject, html);
  }

  /**
   * 发送邮件
   */
  async sendEmail(to, subject, html) {
    if (!this.transporter) {
      console.log(`[Notify] Email (mock): ${to} - ${subject}`);
      return { mock: true, to, subject };
    }
    
    try {
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to,
        subject,
        html
      });
      
      console.log(`[Notify] Email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (e) {
      console.error(`[Notify] Email failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  }

  /**
   * 发送推送通知
   */
  async sendPush(userId, title, body, data = {}) {
    if (!this.pushService) {
      console.log(`[Notify] Push (mock): ${userId} - ${title}`);
      return { mock: true };
    }
    
    return this.pushService.send(userId, title, body, data);
  }

  /**
   * 渲染任务邮件模板
   */
  _renderTaskEmail(task) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 10px; margin-top: 20px; }
          .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; color: #999; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 新任务邀请</h1>
          </div>
          <div class="content">
            <h2>${task.title}</h2>
            <p><strong>描述:</strong> ${task.description}</p>
            <p><strong>预算:</strong> ${task.budget} ${task.token || 'USDC'}</p>
            <p><strong>技能要求:</strong> ${(task.skills || []).join(', ') || '无'}</p>
            <p><strong>截止日期:</strong> ${task.deadline ? new Date(task.deadline).toLocaleString() : '灵活'}</p>
            <a href="https://01gate.io/task/${task.id}" class="button">查看任务详情</a>
          </div>
          <div class="footer">
            <p>01门 - AI驱动的去中心化微任务网络</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * 批量发送通知
   */
  async queueNotification(type, ...args) {
    this.queue.push({ type, args, timestamp: Date.now() });
    
    if (!this.processing) {
      this._processQueue();
    }
  }

  /**
   * 处理队列
   */
  async _processQueue() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        switch (item.type) {
          case 'newTask':
            await this.notifyNewTask(...item.args);
            break;
          case 'taskAccepted':
            await this.notifyTaskAccepted(...item.args);
            break;
          case 'taskCompleted':
            await this.notifyTaskCompleted(...item.args);
            break;
          case 'dispute':
            await this.notifyDispute(...item.args);
            break;
        }
      } catch (e) {
        console.error(`[Notify] Queue error: ${e.message}`);
      }
    }
    
    this.processing = false;
  }
}

module.exports = { NotificationService };
