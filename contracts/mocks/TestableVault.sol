// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title TestableVault
 * @notice Identical logic to DrachmaVault but with injectable addresses
 *         (immutable instead of constant) so we can test with mock contracts.
 */

interface IERC20T {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IStableFXT {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut) external returns (uint256);
}

interface IUSYCT {
    function deposit(uint256 usdcAmount) external returns (uint256 shares);
    function redeem(uint256 shares) external returns (uint256 usdcAmount);
    function navPerShare() external view returns (uint256);
}

contract TestableVault {
    address public immutable USDC;
    address public immutable EURC;
    address public immutable USYC;
    address public immutable STABLE_FX;

    address public owner;
    address public agent;
    uint8   public agentVersion;

    struct AllocationBands {
        uint16 usdcMin; uint16 usdcMax;
        uint16 eurcMin; uint16 eurcMax;
        uint16 usycMin; uint16 usycMax;
    }
    AllocationBands public bands;

    struct DecisionLog {
        uint48  timestamp;
        uint8   action;
        uint16  usdcBpsBefore;
        uint16  eurcBpsBefore;
        uint16  usycBpsBefore;
        uint16  usdcBpsAfter;
        uint16  eurcBpsAfter;
        uint16  usycBpsAfter;
        bytes32 reasoningCID;
    }
    DecisionLog[] public log;

    event Rebalanced(uint256 indexed logIndex, bytes32 reasoningCID, uint256 totalAumUsdc);
    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event AgentRotated(address indexed oldAgent, address indexed newAgent);
    event EmergencyExit(uint256 usdcRecovered);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAgent() { require(msg.sender == agent, "not agent"); _; }

    constructor(
        address _agent,
        address _usdc,
        address _eurc,
        address _usyc,
        address _stableFx
    ) {
        owner = msg.sender;
        agent = _agent;
        USDC = _usdc;
        EURC = _eurc;
        USYC = _usyc;
        STABLE_FX = _stableFx;
        bands = AllocationBands(2000, 6000, 1000, 4000, 2000, 6000);
    }

    function deposit(address token, uint256 amount) external onlyOwner {
        require(token == USDC || token == EURC, "unsupported token");
        IERC20T(token).transferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        require(token == USDC || token == EURC || token == USYC, "unsupported");
        IERC20T(token).transfer(msg.sender, amount);
        emit Withdrawn(token, amount);
    }

    function updateBands(AllocationBands calldata newBands) external onlyOwner {
        require(newBands.usdcMax <= 10000 && newBands.eurcMax <= 10000 && newBands.usycMax <= 10000, "overflow");
        bands = newBands;
    }

    function rotateAgent(address newAgent) external onlyOwner {
        emit AgentRotated(agent, newAgent);
        agent = newAgent;
        agentVersion++;
    }

    function rebalance(
        uint16 targetUsdcBps,
        uint16 targetEurcBps,
        uint16 targetUsycBps,
        bytes32 reasoningCID,
        uint256 minUsdcOut
    ) external onlyAgent {
        require(uint256(targetUsdcBps) + targetEurcBps + targetUsycBps == 10000, "alloc != 100%");
        _checkBands(targetUsdcBps, targetEurcBps, targetUsycBps);

        (uint16 uBefore, uint16 eBefore, uint16 yBefore) = _currentAllocationBps();

        uint256 aum           = _totalAumUsdc();
        uint256 targetUsdcAmt = aum * targetUsdcBps / 10000;
        uint256 targetEurcAmt = aum * targetEurcBps / 10000;
        uint256 targetUsycAmt = aum - targetUsdcAmt - targetEurcAmt;

        uint256 curUsyc = _usycToUsdc(IERC20T(USYC).balanceOf(address(this)));
        uint256 curEurc = _eurcToUsdc(IERC20T(EURC).balanceOf(address(this)));

        if (curUsyc > targetUsycAmt + 1e6) {
            uint256 redeemShares = (curUsyc - targetUsycAmt) * 1e18 / IUSYCT(USYC).navPerShare();
            IUSYCT(USYC).redeem(redeemShares);
        }

        if (curEurc > targetEurcAmt + 1e6) {
            uint256 swapAmt = _usdcToEurc(curEurc - targetEurcAmt);
            IERC20T(EURC).approve(STABLE_FX, swapAmt);
            IStableFXT(STABLE_FX).swap(EURC, USDC, swapAmt, minUsdcOut);
        } else if (curEurc < targetEurcAmt - 1e6) {
            uint256 swapAmt = targetEurcAmt - curEurc;
            IERC20T(USDC).approve(STABLE_FX, swapAmt);
            IStableFXT(STABLE_FX).swap(USDC, EURC, swapAmt, 0);
        }

        uint256 curUsdc = IERC20T(USDC).balanceOf(address(this));
        if (curUsdc > targetUsdcAmt + 1e6) {
            uint256 sweepAmt = curUsdc - targetUsdcAmt;
            IERC20T(USDC).approve(USYC, sweepAmt);
            IUSYCT(USYC).deposit(sweepAmt);
        }

        (uint16 uAfter, uint16 eAfter, uint16 yAfter) = _currentAllocationBps();
        log.push(DecisionLog({
            timestamp: uint48(block.timestamp), action: 0,
            usdcBpsBefore: uBefore, eurcBpsBefore: eBefore, usycBpsBefore: yBefore,
            usdcBpsAfter: uAfter,  eurcBpsAfter: eAfter,  usycBpsAfter: yAfter,
            reasoningCID: reasoningCID
        }));
        emit Rebalanced(log.length - 1, reasoningCID, _totalAumUsdc());
    }

    function emergencyExit(bytes32 reasoningCID) external onlyAgent {
        uint256 usycBal = IERC20T(USYC).balanceOf(address(this));
        if (usycBal > 0) IUSYCT(USYC).redeem(usycBal);
        uint256 eurcBal = IERC20T(EURC).balanceOf(address(this));
        if (eurcBal > 0) {
            IERC20T(EURC).approve(STABLE_FX, eurcBal);
            IStableFXT(STABLE_FX).swap(EURC, USDC, eurcBal, 0);
        }
        log.push(DecisionLog({
            timestamp: uint48(block.timestamp), action: 2,
            usdcBpsBefore: 0, eurcBpsBefore: 0, usycBpsBefore: 0,
            usdcBpsAfter: 10000, eurcBpsAfter: 0, usycBpsAfter: 0,
            reasoningCID: reasoningCID
        }));
        emit EmergencyExit(IERC20T(USDC).balanceOf(address(this)));
    }

    function totalAum() external view returns (
        uint256 usdc, uint256 eurc, uint256 usyc, uint256 totalInUsdc
    ) {
        usdc        = IERC20T(USDC).balanceOf(address(this));
        eurc        = IERC20T(EURC).balanceOf(address(this));
        usyc        = IERC20T(USYC).balanceOf(address(this));
        totalInUsdc = _totalAumUsdc();
    }

    function decisionLogLength() external view returns (uint256) { return log.length; }

    function _totalAumUsdc() internal view returns (uint256) {
        return IERC20T(USDC).balanceOf(address(this))
             + _eurcToUsdc(IERC20T(EURC).balanceOf(address(this)))
             + _usycToUsdc(IERC20T(USYC).balanceOf(address(this)));
    }

    function _currentAllocationBps() internal view returns (uint16 u, uint16 e, uint16 y) {
        uint256 aum = _totalAumUsdc();
        if (aum == 0) return (0, 0, 0);
        u = uint16(IERC20T(USDC).balanceOf(address(this)) * 10000 / aum);
        e = uint16(_eurcToUsdc(IERC20T(EURC).balanceOf(address(this))) * 10000 / aum);
        y = uint16(10000 - u - e);
    }

    function _eurcToUsdc(uint256 eurcAmt) internal pure returns (uint256) { return eurcAmt * 108 / 100; }
    function _usdcToEurc(uint256 usdcAmt) internal pure returns (uint256) { return usdcAmt * 100 / 108; }

    function _usycToUsdc(uint256 shares) internal view returns (uint256) {
        if (shares == 0) return 0;
        return shares * IUSYCT(USYC).navPerShare() / 1e18;
    }

    function _checkBands(uint16 u, uint16 e, uint16 y) internal view {
        require(u >= bands.usdcMin && u <= bands.usdcMax, "USDC out of band");
        require(e >= bands.eurcMin && e <= bands.eurcMax, "EURC out of band");
        require(y >= bands.usycMin && y <= bands.usycMax, "USYC out of band");
    }
}
