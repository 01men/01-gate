// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * 01门 - 任务注册表合约
 * 任务发布、匹配、广播管理
 */
contract TaskRegistry {
    
    // 任务状态
    enum TaskStatus {
        Pending,
        Broadcasting,
        Accepted,
        InProgress,
        Submitted,
        Completed,
        Cancelled,
        Disputed,
        Expired
    }
    
    // 任务结构
    struct Task {
        bytes32 id;
        address requester;
        string title;
        string description;
        uint256 budget;
        address token;
        string[] skills;
        uint256 deadline;
        TaskStatus status;
        address acceptor;
        uint256 broadcastCount;
        uint256 createdAt;
        uint256 updatedAt;
    }
    
    // 任务技能映射
    struct SkillRequirement {
        string skill;
        uint256 minScore;
    }
    
    // 映射
    mapping(bytes32 => Task) public tasks;
    mapping(address => bytes32[]) public requesterTasks;
    mapping(address => bytes32[]) public acceptorTasks;
    mapping(bytes32 => SkillRequirement[]) public taskRequirements;
    
    // 技能索引: skill -> node -> score
    mapping(string => mapping(address => uint256)) public skillIndex;
    
    // 事件
    event TaskCreated(bytes32 indexed id, address indexed requester, uint256 budget);
    event TaskBroadcast(bytes32 indexed id, uint256 count);
    event TaskAccepted(bytes32 indexed id, address indexed acceptor);
    event TaskCompleted(bytes32 indexed id);
    event TaskCancelled(bytes32 indexed id);
    event TaskDisputed(bytes32 indexed id);
    event SkillUpdated(address indexed node, string skill, uint256 score);
    
    /**
     * 创建任务
     */
    function createTask(
        string memory _title,
        string memory _description,
        uint256 _budget,
        address _token,
        string[] memory _skills,
        uint256 _deadline
    ) external returns (bytes32) {
        bytes32 id = keccak256(abi.encodePacked(
            msg.sender,
            _title,
            block.timestamp
        ));
        
        require(tasks[id].createdAt == 0, "Task already exists");
        
        tasks[id] = Task({
            id: id,
            requester: msg.sender,
            title: _title,
            description: _description,
            budget: _budget,
            token: _token,
            skills: _skills,
            deadline: _deadline,
            status: TaskStatus.Pending,
            acceptor: address(0),
            broadcastCount: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        
        // 记录技能要求
        for (uint i = 0; i < _skills.length; i++) {
            taskRequirements[id].push(SkillRequirement({
                skill: _skills[i],
                minScore: 0
            }));
        }
        
        requesterTasks[msg.sender].push(id);
        
        emit TaskCreated(id, msg.sender, _budget);
        
        return id;
    }
    
    /**
     * 广播任务
     */
    function broadcastTask(bytes32 id) external {
        Task storage t = tasks[id];
        require(t.requester == msg.sender, "Not task owner");
        require(t.status == TaskStatus.Pending || t.status == TaskStatus.Broadcasting, "Invalid status");
        
        t.broadcastCount++;
        t.status = TaskStatus.Broadcasting;
        t.updatedAt = block.timestamp;
        
        emit TaskBroadcast(id, t.broadcastCount);
    }
    
    /**
     * 承接任务
     */
    function acceptTask(bytes32 id) external {
        Task storage t = tasks[id];
        require(t.status == TaskStatus.Broadcasting, "Task not broadcasting");
        require(t.requester != msg.sender, "Cannot accept own task");
        
        t.acceptor = msg.sender;
        t.status = TaskStatus.Accepted;
        t.updatedAt = block.timestamp;
        
        acceptorTasks[msg.sender].push(id);
        
        emit TaskAccepted(id, msg.sender);
    }
    
    /**
     * 开始执行
     */
    function startExecution(bytes32 id) external {
        Task storage t = tasks[id];
        require(t.acceptor == msg.sender, "Not task acceptor");
        require(t.status == TaskStatus.Accepted, "Invalid status");
        
        t.status = TaskStatus.InProgress;
        t.updatedAt = block.timestamp;
    }
    
    /**
     * 提交交付物
     */
    function submitTask(bytes32 id, string memory) external {
        Task storage t = tasks[id];
        require(t.acceptor == msg.sender, "Not task acceptor");
        require(t.status == TaskStatus.InProgress, "Invalid status");
        
        t.status = TaskStatus.Submitted;
        t.updatedAt = block.timestamp;
    }
    
    /**
     * 验收通过
     */
    function approveTask(bytes32 id) external {
        Task storage t = tasks[id];
        require(t.requester == msg.sender, "Not task owner");
        require(t.status == TaskStatus.Submitted, "Invalid status");
        
        t.status = TaskStatus.Completed;
        t.updatedAt = block.timestamp;
        
        emit TaskCompleted(id);
    }
    
    /**
     * 取消任务
     */
    function cancelTask(bytes32 id) external {
        Task storage t = tasks[id];
        require(t.requester == msg.sender, "Not task owner");
        require(t.status == TaskStatus.Pending || t.status == TaskStatus.Broadcasting, "Cannot cancel");
        
        t.status = TaskStatus.Cancelled;
        t.updatedAt = block.timestamp;
        
        emit TaskCancelled(id);
    }
    
    /**
     * 发起争议
     */
    function disputeTask(bytes32 id) external {
        Task storage t = tasks[id];
        require(
            msg.sender == t.requester || msg.sender == t.acceptor,
            "Not authorized"
        );
        require(
            t.status == TaskStatus.Submitted || t.status == TaskStatus.Accepted,
            "Cannot dispute"
        );
        
        t.status = TaskStatus.Disputed;
        t.updatedAt = block.timestamp;
        
        emit TaskDisputed(id);
    }
    
    /**
     * 更新节点技能
     */
    function updateSkill(address node, string memory skill, uint256 score) external {
        skillIndex[skill][node] = score;
        
        emit SkillUpdated(node, skill, score);
    }
    
    /**
     * 获取任务详情
     */
    function getTask(bytes32 id) external view returns (
        address requester,
        string memory title,
        uint256 budget,
        TaskStatus status,
        address acceptor,
        uint256 deadline
    ) {
        Task storage t = tasks[id];
        return (
            t.requester,
            t.title,
            t.budget,
            t.status,
            t.acceptor,
            t.deadline
        );
    }
    
    /**
     * 查找匹配节点
     */
    function findMatchingNodes(bytes32 id, uint256 limit) external view returns (address[] memory) {
        Task storage t = tasks[id];
        require(t.createdAt > 0, "Task not found");
        
        address[] memory result = new address[](limit);
        uint256 count = 0;
        
        // 遍历技能要求
        for (uint256 i = 0; i < t.skills.length && count < limit; i++) {
            string memory skill = t.skills[i];
            
            // 简化: 假设我们可以遍历所有节点
            // 生产环境应使用外部索引服务
            if (skillIndex[skill][msg.sender] > 0) {
                result[count++] = msg.sender;
            }
        }
        
        return result;
    }
}
