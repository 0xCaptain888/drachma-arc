// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DrachmaScoreOracle {
    address public owner;
    address public factory;

    struct ScoreComponents {
        uint16 yieldPerformance;  // 0-300
        uint16 bandDiscipline;    // 0-250
        uint16 riskResponse;      // 0-250
        uint16 consistency;       // 0-200
    }

    struct ScoreRecord {
        uint16 totalScore;
        ScoreComponents components;
        uint48 timestamp;
        bytes32 evidenceCID;
        uint256 periodStart;
        uint256 periodEnd;
    }

    mapping(address => uint16)        public currentScore;
    mapping(address => ScoreRecord[]) public scoreHistory;
    mapping(address => bool)          public initializedVaults;
    mapping(address => uint48)        public lastUpdatedAt;

    uint16 public constant CREDIT_THRESHOLD = 750;
    mapping(address => bool) public creditLaneEligible;

    uint256 public constant UPDATE_INTERVAL = 7 days;

    event VaultInitialized(address indexed vault, uint16 initialScore);
    event ScoreUpdated(address indexed vault, uint16 newScore, uint16 oldScore, bytes32 evidenceCID);
    event CreditLaneGranted(address indexed vault, uint16 score);
    event CreditLaneRevoked(address indexed vault, uint16 score);

    modifier onlyOwnerOrFactory() {
        require(msg.sender == owner || msg.sender == factory, "unauthorized");
        _;
    }

    constructor() { owner = msg.sender; }

    function setFactory(address _factory) external {
        require(msg.sender == owner, "not owner");
        factory = _factory;
    }

    function initializeVault(address vault) external onlyOwnerOrFactory {
        require(!initializedVaults[vault], "already initialized");
        initializedVaults[vault] = true;
        currentScore[vault] = 500;
        emit VaultInitialized(vault, 500);
    }

    function updateScore(
        address vault,
        ScoreComponents calldata components,
        bytes32 evidenceCID,
        uint256 periodStart,
        uint256 periodEnd
    ) external {
        require(initializedVaults[vault], "vault not initialized");
        require(
            block.timestamp >= uint256(lastUpdatedAt[vault]) + UPDATE_INTERVAL,
            "too soon"
        );
        require(components.yieldPerformance <= 300, "yield > 300");
        require(components.bandDiscipline   <= 250, "discipline > 250");
        require(components.riskResponse     <= 250, "risk > 250");
        require(components.consistency      <= 200, "consistency > 200");

        uint16 newScore = components.yieldPerformance +
                          components.bandDiscipline +
                          components.riskResponse +
                          components.consistency;
        require(newScore <= 1000, "score > 1000");

        uint16 oldScore = currentScore[vault];
        currentScore[vault] = newScore;
        lastUpdatedAt[vault] = uint48(block.timestamp);

        scoreHistory[vault].push(ScoreRecord({
            totalScore:  newScore,
            components:  components,
            timestamp:   uint48(block.timestamp),
            evidenceCID: evidenceCID,
            periodStart: periodStart,
            periodEnd:   periodEnd
        }));

        bool wasEligible = creditLaneEligible[vault];
        bool isEligible  = newScore >= CREDIT_THRESHOLD;

        if (isEligible && !wasEligible) {
            creditLaneEligible[vault] = true;
            emit CreditLaneGranted(vault, newScore);
        } else if (!isEligible && wasEligible) {
            creditLaneEligible[vault] = false;
            emit CreditLaneRevoked(vault, newScore);
        }

        emit ScoreUpdated(vault, newScore, oldScore, evidenceCID);
    }

    function getScore(address vault) external view returns (uint16) {
        return currentScore[vault];
    }

    function getScoreHistory(address vault) external view returns (ScoreRecord[] memory) {
        return scoreHistory[vault];
    }

    function isCreditLaneEligible(address vault) external view returns (bool) {
        return creditLaneEligible[vault];
    }

    function getScoreBreakdown(address vault)
        external view returns (uint16 total, ScoreComponents memory latest)
    {
        total = currentScore[vault];
        if (scoreHistory[vault].length > 0) {
            latest = scoreHistory[vault][scoreHistory[vault].length - 1].components;
        }
    }

    function getScoreForDisplay(address vault) external view returns (
        uint16 score, bool creditLane, uint48 lastUpdate, uint256 historyLength
    ) {
        score         = currentScore[vault];
        creditLane    = creditLaneEligible[vault];
        lastUpdate    = lastUpdatedAt[vault];
        historyLength = scoreHistory[vault].length;
    }
}
