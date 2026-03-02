// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * 01门 - 仲裁合约 (增强版)
 * 支持 LQC (逻辑质量系数)、双轨激励、隐私投票
 */
contract Arbitration {
    
    // 案件状态
    enum CaseStatus { 
        Open,       // 开放投票
        Voting,     // 投票中
        Revealed,   // 投票揭示
        Resolved,   // 已解决
        Expired     // 已过期
    }
    
    // 案件
    struct Case {
        bytes32 caseId;
        bytes32 taskId;
        address requester;
        address acceptor;
        uint256 amount;
        string description;
        CaseStatus status;
        uint256 voteCount;
        uint256 appealCount;
        uint256 ruling; // 0: requester, 1: acceptor, 2: split
        uint256 requesterVotes;
        uint256 acceptorVotes;
        uint256 splitVotes;
        uint256 createdAt;
        uint256 deadline;
        uint256 appealDeadline;
    }
    
    // 投票
    struct Vote {
        address juror;
        uint256 ruling; // 0, 1, 2
        bytes32 commit; // 投票承诺
        string reasoning; // 理由
        uint256 lqc; // 逻辑质量系数 (0-100)
        bool revealed;
        uint256 staked;
    }
    
    // 陪审员
    struct Juror {
        address addr;
        uint256 staked;
        uint256 totalCases;
        uint256 correctCases;
        uint256 totalLQC;
        bool isActive;
    }
    
    // 映射
    mapping(bytes32 => Case) public cases;
    mapping(bytes32 => mapping(address => Vote)) public votes;
    mapping(address => Juror) public jurors;
    mapping(bytes32 => address[]) public caseJurors;
    
    // 参数
    uint256 public constant VOTE_DURATION = 3 days;
    uint256 public constant APPEAL_DURATION = 2 days;
    uint256 public constant MIN_STAKE = 100 ether;
    uint256 public constant BASE_REWARD = 0.01 ether;
    uint256 public constant LQC_WEIGHT = 50; // LQC 权重 50%
    
    // 事件
    caseCreated(bytes32 indexed caseId, address indexed requester, address indexed acceptor, uint256 amount);
    VoteCommitted(bytes32 indexed caseId, address indexed juror);
    VoteRevealed(bytes32 indexed caseId, address indexed juror, uint256 ruling);
    CaseResolved(bytes32 indexed caseId, uint256 ruling);
    caseAppealed(bytes32 indexed caseId, address indexed appellant);
    JurorStaked(address indexed juror, uint256 amount);
    JurorSlashed(address indexed juror, uint256 amount);
    
    /**
     * 创建仲裁案件
     */
    function createCase(
        bytes32 _taskId,
        address _requester,
        address _acceptor,
        uint256 _amount,
        string memory _description
    ) external returns (bytes32) {
        bytes32 caseId = keccak256(abi.encodePacked(
            _taskId,
            _requester,
            _acceptor,
            block.timestamp
        ));
        
        require(cases[caseId].createdAt == 0, "Case already exists");
        
        cases[caseId] = Case({
            caseId: caseId,
            taskId: _taskId,
            requester: _requester,
            acceptor: _acceptor,
            amount: _amount,
            description: _description,
            status: CaseStatus.Open,
            voteCount: 0,
            appealCount: 0,
            ruling: 0,
            requesterVotes: 0,
            acceptorVotes: 0,
            splitVotes: 0,
            createdAt: block.timestamp,
            deadline: block.timestamp + VOTE_DURATION,
            appealDeadline: 0
        });
        
        emit CaseCreated(caseId, _requester, _acceptor, _amount);
        
        return caseId;
    }
    
    /**
     * 提交投票承诺
     */
    function commitVote(bytes32 caseId, bytes32 commit) external {
        Case storage c = cases[caseId];
        require(c.status == CaseStatus.Open || c.status == CaseStatus.Voting, "Case not voting");
        require(block.timestamp < c.deadline, "Voting ended");
        
        votes[caseId][msg.sender] = Vote({
            juror: msg.sender,
            ruling: 0,
            commit: commit,
            reasoning: "",
            lqc: 0,
            revealed: false,
            staked: jurors[msg.sender].staked
        });
        
        caseJurors[caseId].push(msg.sender);
        c.voteCount++;
        c.status = CaseStatus.Voting;
        
        emit VoteCommitted(caseId, msg.sender);
    }
    
    /**
     * 揭示投票
     */
    function revealVote(
        bytes32 caseId,
        uint256 ruling,
        string memory reasoning,
        uint256 salt
    ) external {
        Case storage c = cases[caseId];
        Vote storage v = votes[caseId][msg.sender];
        
        require(c.status == CaseStatus.Voting, "Not in voting");
        require(!v.revealed, "Already revealed");
        require(block.timestamp < c.deadline, "Voting ended");
        
        // 验证承诺
        bytes32 expectedCommit = keccak256(abi.encodePacked(msg.sender, ruling, salt));
        require(v.commit == expectedCommit, "Invalid reveal");
        
        // 计算 LQC
        uint256 lqc = calculateLQC(reasoning);
        
        v.ruling = ruling;
        v.reasoning = reasoning;
        v.lqc = lqc;
        v.revealed = true;
        
        // 统计投票
        if (ruling == 0) c.requesterVotes++;
        else if (ruling == 1) c.acceptorVotes++;
        else c.splitVotes++;
        
        emit VoteRevealed(caseId, msg.sender, ruling);
    }
    
    /**
     * 计算 LQC (逻辑质量系数)
     */
    function calculateLQC(string memory reasoning) internal pure returns (uint256) {
        bytes memory b = bytes(reasoning);
        if (b.length < 20) return 10; // 太短
        if (b.length < 50) return 30; // 较短
        if (b.length < 100) return 50; // 中等
        if (b.length < 200) return 70; // 较好
        if (b.length < 500) return 90; // 详细
        return 100; // 非常详细
    }
    
    /**
     * 解决案件
     */
    function resolveCase(bytes32 caseId) external {
        Case storage c = cases[caseId];
        require(c.status == CaseStatus.Voting, "Not in voting");
        require(block.timestamp >= c.deadline || c.voteCount >= 3, "Voting not ended");
        
        // 使用 LQC 加权计算结果
        uint256 requesterWeight = 0;
        uint256 acceptorWeight = 0;
        uint256 splitWeight = 0;
        
        address[] memory jurorsList = caseJurors[caseId];
        for (uint i = 0; i < jurorsList.length; i++) {
            Vote storage v = votes[caseId][jurorsList[i]];
            if (!v.revealed) continue;
            
            uint256 weight = v.lqc * v.staked / 100;
            
            if (v.ruling == 0) requesterWeight += weight;
            else if (v.ruling == 1) acceptorWeight += weight;
            else splitWeight += weight;
        }
        
        // 确定获胜方
        if (requesterWeight > acceptorWeight && requesterWeight > splitWeight) {
            c.ruling = 0;
        } else if (acceptorWeight > requesterWeight && acceptorWeight > splitWeight) {
            c.ruling = 1;
        } else {
            c.ruling = 2; // 平局
        }
        
        c.status = CaseStatus.Resolved;
        
        emit CaseResolved(caseId, c.ruling);
    }
    
    /**
     * 上诉
     */
    function appeal(bytes32 caseId) external payable {
        Case storage c = cases[caseId];
        require(c.status == CaseStatus.Resolved, "Case not resolved");
        require(c.appealCount < 2, "Max appeals reached");
        
        uint256 appealFee = c.amount / 10; // 10% 上诉费
        require(msg.value >= appealFee, "Insufficient appeal fee");
        
        c.appealCount++;
        c.appealDeadline = block.timestamp + APPEAL_DURATION;
        c.status = CaseStatus.Open;
        
        emit CaseAppealed(caseId, msg.sender);
    }
    
    /**
     * 质押成为陪审员
     */
    function stake() external payable {
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        
        jurors[msg.sender].addr = msg.sender;
        jurors[msg.sender].staked += msg.value;
        jurors[msg.sender].isActive = true;
        
        emit JurorStaked(msg.sender, msg.value);
    }
    
    /**
     * 获得仲裁奖励
     */
    function claimReward(bytes32 caseId) external {
        Vote storage v = votes[caseId][msg.sender];
        require(v.revealed, "Vote not revealed");
        
        Case storage c = cases[caseId];
        require(c.status == CaseStatus.Resolved, "Case not resolved");
        
        // 检查投票是否正确
        bool correct = (v.ruling == c.ruling);
        
        // 计算奖励: 基础奖励 * LQC系数
        uint256 reward = BASE_REWARD * v.lqc / 100;
        if (correct) {
            reward *= 2;
        }
        
        payable(msg.sender).transfer(reward);
    }
    
    /**
     * 获取案件详情
     */
    function getCase(bytes32 caseId) external view returns (
        address requester,
        address acceptor,
        uint256 amount,
        CaseStatus status,
        uint256 ruling,
        uint256 requesterVotes,
        uint256 acceptorVotes,
        uint256 deadline
    ) {
        Case storage c = cases[caseId];
        return (
            c.requester,
            c.acceptor,
            c.amount,
            c.status,
            c.ruling,
            c.requesterVotes,
            c.acceptorVotes,
            c.deadline
        );
    }
}
