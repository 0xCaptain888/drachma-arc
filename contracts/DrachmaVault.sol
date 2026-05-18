// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DrachmaVault v2
 * @notice Autonomous stablecoin reserve vault with dUSDC receipt token.
 *         Upgrades from v1: dUSDC ERC20, DrachmaScore integration, triggerType tracking.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
}

interface IStableFX {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256);
}

interface IUSYC {
    function deposit(uint256 usdcAmount) external returns (uint256 shares);
    function redeem(uint256 shares) external returns (uint256 usdcAmount);
    function navPerShare() external view returns (uint256);
}

contract DrachmaVault {

    // --- ERC20 (dUSDC) State ---
    string  public name     = "Drachma USDC";
    string  public symbol   = "dUSDC";
    uint8   public decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint256 public navPerShare = 1_000_000;  // 1.000000 USDC per dUSDC

    // --- Token addresses (Arc Testnet) ---
    address public constant USDC      = 0x3600000000000000000000000000000000000000;
    address public constant EURC      = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address public constant USYC      = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;
    address public constant STABLE_FX = 0x867650F5eAe8df91445971f14d89fd84F0C9a9f8;

    address public owner;
    address public agent;
    uint8   public agentVersion;

    // --- v2 New State ---
    uint16  public reserveScore = 500;
    address public signalBus;
    address public scoreOracle;

    struct AllocationBands {
        uint16 usdcMin; uint16 usdcMax;
        uint16 eurcMin; uint16 eurcMax;
        uint16 usycMin; uint16 usycMax;
    }
    AllocationBands public bands;

    struct DecisionLog {
        uint48  timestamp;
        uint8   action;            // 0=rebalance, 1=sweep, 2=emergency
        uint16  usdcBpsBefore; uint16 eurcBpsBefore; uint16 usycBpsBefore;
        uint16  usdcBpsAfter;  uint16 eurcBpsAfter;  uint16 usycBpsAfter;
        bytes32 reasoningCID;
        uint8   triggerType;       // 0=scheduled, 1=consensus, 2=urgent, 3=conversation
        int32   networkSignalValue;
    }
    DecisionLog[] public log;

    // --- Events ---
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed _owner, address indexed spender, uint256 value);
    event Rebalanced(uint256 indexed logIndex, bytes32 reasoningCID, uint256 totalAumUsdc, uint8 triggerType);
    event Deposited(address indexed depositor, address token, uint256 amount, uint256 dUsdcMinted);
    event Withdrawn(address indexed redeemer, uint256 dUsdcBurned, uint256 usdcOut);
    event NavUpdated(uint256 newNavPerShare, uint256 totalAumUsdc);
    event ScoreUpdated(uint16 oldScore, uint16 newScore, bytes32 evidenceCID);
    event AgentRotated(address indexed oldAgent, address indexed newAgent);
    event EmergencyExit(uint256 usdcRecovered);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAgent() { require(msg.sender == agent, "not agent"); _; }

    constructor(address _agent, address _signalBus, address _scoreOracle) {
        owner       = msg.sender;
        agent       = _agent;
        signalBus   = _signalBus;
        scoreOracle = _scoreOracle;
        bands       = AllocationBands(2000, 6000, 1000, 4000, 2000, 6000);
    }

    // --- ERC20 Functions (dUSDC) ---
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from]             -= amount;
        balanceOf[to]               += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    // --- Deposit: USDC -> dUSDC ---
    function depositForShares(uint256 usdcAmount) external returns (uint256 dShares) {
        require(usdcAmount > 0, "zero deposit");
        IERC20(USDC).transferFrom(msg.sender, address(this), usdcAmount);
        dShares = usdcAmount * 1_000_000 / navPerShare;
        totalSupply           += dShares;
        balanceOf[msg.sender] += dShares;
        emit Transfer(address(0), msg.sender, dShares);
        emit Deposited(msg.sender, USDC, usdcAmount, dShares);
    }

    // --- Redeem: dUSDC -> USDC ---
    function redeemShares(uint256 dShares) external returns (uint256 usdcOut) {
        require(balanceOf[msg.sender] >= dShares, "insufficient shares");
        usdcOut = dShares * navPerShare / 1_000_000;
        uint256 liquidUsdc = IERC20(USDC).balanceOf(address(this));
        require(liquidUsdc >= usdcOut, "insufficient liquidity");
        totalSupply           -= dShares;
        balanceOf[msg.sender] -= dShares;
        IERC20(USDC).transfer(msg.sender, usdcOut);
        emit Transfer(msg.sender, address(0), dShares);
        emit Withdrawn(msg.sender, dShares, usdcOut);
    }

    // --- NAV Update ---
    function updateNav() external onlyAgent {
        uint256 aum = _totalAumUsdc();
        if (totalSupply > 0) {
            navPerShare = aum * 1_000_000 / totalSupply;
        }
        emit NavUpdated(navPerShare, aum);
    }

    // --- Score Update ---
    function updateReserveScore(uint16 newScore, bytes32 evidenceCID) external onlyAgent {
        require(newScore <= 1000, "score > 1000");
        uint16 old = reserveScore;
        reserveScore = newScore;
        emit ScoreUpdated(old, newScore, evidenceCID);
    }

    // --- Rebalance v2 ---
    function rebalance(
        uint16 targetUsdcBps,
        uint16 targetEurcBps,
        uint16 targetUsycBps,
        bytes32 reasoningCID,
        uint256 minUsdcOut,
        uint8   triggerType,
        int32   networkSignalValue
    ) external onlyAgent {
        require(uint256(targetUsdcBps) + targetEurcBps + targetUsycBps == 10000, "!= 100%");
        _checkBands(targetUsdcBps, targetEurcBps, targetUsycBps);

        (uint16 uB, uint16 eB, uint16 yB) = _currentAllocationBps();

        uint256 aum           = _totalAumUsdc();
        uint256 targetUsdcAmt = aum * targetUsdcBps / 10000;
        uint256 targetEurcAmt = aum * targetEurcBps / 10000;

        uint256 curUsyc = _usycToUsdc(IERC20(USYC).balanceOf(address(this)));
        uint256 curEurc = _eurcToUsdc(IERC20(EURC).balanceOf(address(this)));
        uint256 targetUsycAmt = aum - targetUsdcAmt - targetEurcAmt;

        if (curUsyc > targetUsycAmt + 1e6) {
            uint256 s = (curUsyc - targetUsycAmt) * 1e18 / IUSYC(USYC).navPerShare();
            IUSYC(USYC).redeem(s);
        }

        if (curEurc > targetEurcAmt + 1e6) {
            uint256 sw = _usdcToEurc(curEurc - targetEurcAmt);
            IERC20(EURC).approve(STABLE_FX, sw);
            IStableFX(STABLE_FX).swap(EURC, USDC, sw, minUsdcOut);
        } else if (curEurc < targetEurcAmt - 1e6) {
            uint256 sw = targetEurcAmt - curEurc;
            IERC20(USDC).approve(STABLE_FX, sw);
            IStableFX(STABLE_FX).swap(USDC, EURC, sw, 0);
        }

        uint256 curUsdc = IERC20(USDC).balanceOf(address(this));
        if (curUsdc > targetUsdcAmt + 1e6) {
            uint256 sweep = curUsdc - targetUsdcAmt;
            IERC20(USDC).approve(USYC, sweep);
            IUSYC(USYC).deposit(sweep);
        }

        if (totalSupply > 0) {
            navPerShare = _totalAumUsdc() * 1_000_000 / totalSupply;
        }

        (uint16 uA, uint16 eA, uint16 yA) = _currentAllocationBps();
        log.push(DecisionLog({
            timestamp: uint48(block.timestamp), action: 0,
            usdcBpsBefore: uB, eurcBpsBefore: eB, usycBpsBefore: yB,
            usdcBpsAfter:  uA, eurcBpsAfter:  eA, usycBpsAfter:  yA,
            reasoningCID: reasoningCID,
            triggerType:  triggerType,
            networkSignalValue: networkSignalValue
        }));

        emit Rebalanced(log.length - 1, reasoningCID, _totalAumUsdc(), triggerType);
    }

    function emergencyExit(bytes32 reasoningCID) external onlyAgent {
        uint256 usycBal = IERC20(USYC).balanceOf(address(this));
        if (usycBal > 0) IUSYC(USYC).redeem(usycBal);
        uint256 eurcBal = IERC20(EURC).balanceOf(address(this));
        if (eurcBal > 0) {
            IERC20(EURC).approve(STABLE_FX, eurcBal);
            IStableFX(STABLE_FX).swap(EURC, USDC, eurcBal, 0);
        }
        if (totalSupply > 0) {
            navPerShare = _totalAumUsdc() * 1_000_000 / totalSupply;
        }
        log.push(DecisionLog({
            timestamp: uint48(block.timestamp), action: 2,
            usdcBpsBefore: 0, eurcBpsBefore: 0, usycBpsBefore: 0,
            usdcBpsAfter: 10000, eurcBpsAfter: 0, usycBpsAfter: 0,
            reasoningCID: reasoningCID, triggerType: 2, networkSignalValue: 0
        }));
        emit EmergencyExit(IERC20(USDC).balanceOf(address(this)));
    }

    // --- Owner Functions ---
    function deposit(address token, uint256 amount) external onlyOwner {
        require(token == USDC || token == EURC, "unsupported");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, token, amount, 0);
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(msg.sender, amount);
    }

    function updateBands(AllocationBands calldata nb) external onlyOwner {
        bands = nb;
    }

    function rotateAgent(address newAgent) external onlyOwner {
        emit AgentRotated(agent, newAgent);
        agent = newAgent;
        agentVersion++;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        owner = newOwner;
    }

    // --- View ---
    function totalAum() external view returns (
        uint256 usdc, uint256 eurc, uint256 usyc, uint256 totalInUsdc
    ) {
        usdc        = IERC20(USDC).balanceOf(address(this));
        eurc        = IERC20(EURC).balanceOf(address(this));
        usyc        = IERC20(USYC).balanceOf(address(this));
        totalInUsdc = _totalAumUsdc();
    }

    function decisionLogLength() external view returns (uint256) { return log.length; }

    function getShareValue(address holder) external view returns (
        uint256 dUsdcBalance, uint256 usdcValue
    ) {
        dUsdcBalance = balanceOf[holder];
        usdcValue    = dUsdcBalance * navPerShare / 1_000_000;
    }

    // --- Internal ---
    function _totalAumUsdc() internal view returns (uint256) {
        return IERC20(USDC).balanceOf(address(this))
             + _eurcToUsdc(IERC20(EURC).balanceOf(address(this)))
             + _usycToUsdc(IERC20(USYC).balanceOf(address(this)));
    }

    function _currentAllocationBps() internal view returns (uint16 u, uint16 e, uint16 y) {
        uint256 aum = _totalAumUsdc();
        if (aum == 0) return (0, 0, 0);
        u = uint16(IERC20(USDC).balanceOf(address(this)) * 10000 / aum);
        e = uint16(_eurcToUsdc(IERC20(EURC).balanceOf(address(this))) * 10000 / aum);
        y = uint16(10000 - u - e);
    }

    function _eurcToUsdc(uint256 a) internal pure returns (uint256) { return a * 108 / 100; }
    function _usdcToEurc(uint256 a) internal pure returns (uint256) { return a * 100 / 108; }

    function _usycToUsdc(uint256 shares) internal view returns (uint256) {
        if (shares == 0) return 0;
        return shares * IUSYC(USYC).navPerShare() / 1e18;
    }

    function _checkBands(uint16 u, uint16 e, uint16 y) internal view {
        require(u >= bands.usdcMin && u <= bands.usdcMax, "USDC band");
        require(e >= bands.eurcMin && e <= bands.eurcMax, "EURC band");
        require(y >= bands.usycMin && y <= bands.usycMax, "USYC band");
    }
}
