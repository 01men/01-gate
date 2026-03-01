/**
 * 01门 - 测试文件
 */

const { Identity } = require('../src/identity/Identity');
const { Task, TaskStatus } = require('../src/task/Task');
const { VRF } = require('../src/p2p/VRF');

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('   01门 - 测试');
  console.log('═══════════════════════════════════════\n');

// 测试 1: 身份生成
console.log('测试 1: 身份生成');
try {
  const identity = Identity.generate();
  console.log('  ✅ 身份生成成功');
  console.log(`     DID: ${identity.did}`);
  console.log(`     地址: ${identity.address}`);
} catch (e) {
  console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试 2: 签名验证
console.log('测试 2: 签名验证');
try {
  const identity = Identity.generate();
  const message = 'Hello 01 Gate!';
  const signature = await identity.sign(message);
  const isValid = Identity.verify(message, signature, identity.address);
  console.log(`  ${isValid ? '✅' : '❌'} 签名验证: ${isValid}`);
} catch (e) {
  console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试 3: 任务创建
console.log('测试 3: 任务创建');
try {
  const task = new Task({
    title: '测试任务',
    description: '这是一个测试任务',
    requester: 'did:01gate:test',
    budget: 100,
    token: 'USDC',
    skills: ['test'],
    deadline: Date.now() + 86400000
  });
  console.log('  ✅ 任务创建成功');
  console.log(`     ID: ${task.id}`);
  console.log(`     状态: ${task.status}`);
} catch (e) {
  console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试 4: 任务状态转换
console.log('测试 4: 任务状态转换');
try {
  const task = new Task({
    title: '测试任务',
    description: '测试',
    requester: 'did:01gate:test',
    budget: 100,
    token: 'USDC'
  });
  
  task.broadcast();
  console.log(`  广播后: ${task.status}`);
  
  task.accept('did:01gate:acceptor');
  console.log(`  承接后: ${task.status}`);
  
  task.transition(TaskStatus.IN_PROGRESS);
  console.log(`  进行中: ${task.status}`);
  
  task.submit({ url: 'test.com/result' });
  console.log(`  提交后: ${task.status}`);
  
  task.transition(TaskStatus.UNDER_REVIEW);
  console.log(`  验收中: ${task.status}`);
  
  task.approve();
  console.log(`  验收后: ${task.status}`);
  
  console.log('  ✅ 状态转换正常');
} catch (e) {
  console.log('  ❌ 失败:', e.message);
}

console.log('');

// 测试 5: VRF 随机数生成
console.log('测试 5: VRF 随机数生成');
try {
  const identity = Identity.generate();
  const vrf = new VRF(identity.privateKey, identity.publicKey);
  const result = vrf.generate('test-seed');
  console.log('  ✅ VRF 生成成功');
  console.log(`     随机数: ${result.random.toFixed(6)}`);
  console.log(`     哈希: ${result.hash.slice(0, 16)}...`);
} catch (e) {
  console.log('  ❌ 失败:', e.message);
}

console.log('\n═══════════════════════════════════════');
console.log('   测试完成');
console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
