// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DrachmaVault
 * @notice AI-managed stablecoin reserve vault on Arc (Circle L1)
 * @dev Supports USDC, EURC, USYC — agent is the sole authorized rebalancer.
 *      Every rebalance call appends an immutable DecisionLog entry on-chain,
 *      containing the IPFS CID of the full LLM reasoning trace.
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IStableFX {
    /// @notice Circle StableFX: USDC ↔ EURC at oracle rate
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) external returns (uint256 amountOut);
}

interface IUSYC {
    /// @notice Deposit USDC, receive USYC shares
    function deposit(uint256 usdcAmount) external returns (uint256 shares);
    /// @notice Redeem USYC shares back to USDC (T+1 on Arc)
    function redeem(uint256 shares) external returns (uint256 usdcAmount);
    /// @notice Current NAV per share in USDC (18 decimals)
    function navPerShare() external view returns (uint256);
}

contract DrachmaVault {

    // ─── Arc / Circle Contract Addresses (update per environment) ─────────────
    address public constant USDC      = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address public constant EURC      = 0x08210F9170F89Ab7658F0B5E3fF39b0E03C2e443;
    address public constant USYC      = 0xc3CDd5F3dF3eBb6E3C2FB05E61Ee2D3f0c0b54C;
    address public constant STABLE_FX = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    // ─── State ─────────────────────────────────────────────────────────────────
    address public owner;
    address public agent;         // Circle Agent Wallet — only rebalancer
    uint8   public agentVersion;  // incremented on key rotation

    struct AllocationBands {
        uint16 usdcMin; uint16 usdcMax;
        uint16 eurcMin; uint16 eurcMax;
        uint16 usycMin; uint16 usycMax;
    }
    AllocationBands public bands;

    struct DecisionLog {
        uint48  timestamp;
        uint8   action;           // 0=rebalance 1=sweep_yield 2=emergency_exit
        uint16  usdcBpsBefore;
        uint16  eurcBpsBefore;
        uint16  usycBpsBefore;
        uint16  usdcBpsAfter;
        uint16  eurcBpsAfter;
        uint16  usycBpsAfter;
        bytes32 reasoningCID;     // sha256(IPFS CID) of full LLM reasoning trace
    }
    DecisionLog[] public log;

    // ─── Events ────────────────────────────────────────────────────────────────
    event Rebalanced(uint256 indexed logIndex, bytes32 reasoningCID, uint256 totalAumUsdc);
    event Deposited(address indexed token, uint256 amount);
    event Withdrawn(address indexed token, uint256 amount);
    event AgentRotated(address indexed oldAgent, address indexed newAgent);
    event EmergencyExit(uint256 usdcRecovered);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier onlyAgent() { require(msg.sender == agent, "not agent"); _; }

    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
        // Default bands: USDC 20-60%, EURC 10-40%, USYC 20-60%
        bands = AllocationBands(2000, 6000, 1000, 4000, 2000, 6000);
    }

    // ─── Owner Functions ───────────────────────────────────────────────────────

    function deposit(address token, uint256 amount) external onlyOwner {
        require(token == USDC || token == EURC, "unsupported token");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        emit Deposited(token, amount);
    }

    function withdraw(address token, uint256 amount) external onlyOwner {
        require(token == USDC || token == EURC || token == USYC, "unsupported");
        IERC20(token).transfer(msg.sender, amount);
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

    // ─── Agent Functions ───────────────────────────────────────────────────────

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

        uint256 aum          = _totalAumUsdc();
        uint256 targetUsdcAmt = aum * targetUsdcBps / 10000;
        uint256 targetEurcAmt = aum * targetEurcBps / 10000;
        uint256 targetUsycAmt = aum - targetUsdcAmt - targetEurcAmt;

        uint256 curUsyc = _usycToUsdc(IERC20(USYC).balanceOf(address(this)));
        uint256 curEurc = _eurcToUsdc(IERC20(EURC).balanceOf(address(this)));

        // Step 1: Exit USYC if overweight
        if (curUsyc > targetUsycAmt + 1e6) {
            uint256 redeemShares = (curUsyc - targetUsycAmt) * 1e18 / IUSYC(USYC).navPerShare();
            IUSYC(USYC).redeem(redeemShares);
        }

        // Step 2: Swap EURC ↔ USDC
        if (curEurc > targetEurcAmt + 1e6) {
            uint256 swapAmt = _usdcToEurc(curEurc - targetEurcAmt);
            IERC20(EURC).approve(STABLE_FX, swapAmt);
            IStableFX(STABLE_FX).swap(EURC, USDC, swapAmt, minUsdcOut);
        } else if (curEurc < targetEurcAmt - 1e6) {
            uint256 swapAmt = targetEurcAmt - curEurc;
            IERC20(USDC).approve(STABLE_FX, swapAmt);
            IStableFX(STABLE_FX).swap(USDC, EURC, swapAmt, 0);
        }

        // Step 3: Sweep to USYC if underweight
        uint256 curUsdc = IERC20(USDC).balanceOf(address(this));
        if (curUsdc > targetUsdcAmt + 1e6) {
            uint256 sweepAmt = curUsdc - targetUsdcAmt;
            IERC20(USDC).approve(USYC, sweepAmt);
            IUSYC(USYC).deposit(sweepAmt);
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
        uint256 usycBal = IERC20(USYC).balanceOf(address(this));
        if (usycBal > 0) IUSYC(USYC).redeem(usycBal);
        uint256 eurcBal = IERC20(EURC).balanceOf(address(this));
        if (eurcBal > 0) {
            IERC20(EURC).approve(STABLE_FX, eurcBal);
            IStableFX(STABLE_FX).swap(EURC, USDC, eurcBal, 0);
        }
        log.push(DecisionLog({
            timestamp: uint48(block.timestamp), action: 2,
            usdcBpsBefore: 0, eurcBpsBefore: 0, usycBpsBefore: 0,
            usdcBpsAfter: 10000, eurcBpsAfter: 0, usycBpsAfter: 0,
            reasoningCID: reasoningCID
        }));
        emit EmergencyExit(IERC20(USDC).balanceOf(address(this)));
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    function totalAum() external view returns (
        uint256 usdc, uint256 eurc, uint256 usyc, uint256 totalInUsdc
    ) {
        usdc        = IERC20(USDC).balanceOf(address(this));
        eurc        = IERC20(EURC).balanceOf(address(this));
        usyc        = IERC20(USYC).balanceOf(address(this));
        totalInUsdc = _totalAumUsdc();
    }

    function decisionLogLength() external view returns (uint256) { return log.length; }

    // ─── Internal ──────────────────────────────────────────────────────────────

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

    // Simplified 1 EURC = 1.08 USDC for testnet; replace with StableFX oracle in prod
    function _eurcToUsdc(uint256 eurcAmt) internal pure returns (uint256) { return eurcAmt * 108 / 100; }
    function _usdcToEurc(uint256 usdcAmt) internal pure returns (uint256) { return usdcAmt * 100 / 108; }

    function _usycToUsdc(uint256 shares) internal view returns (uint256) {
        if (shares == 0) return 0;
        return shares * IUSYC(USYC).navPerShare() / 1e18;
    }

    function _checkBands(uint16 u, uint16 e, uint16 y) internal view {
        require(u >= bands.usdcMin && u <= bands.usdcMax, "USDC out of band");
        require(e >= bands.eurcMin && e <= bands.eurcMax, "EURC out of band");
        require(y >= bands.usycMin && y <= bands.usycMax, "USYC out of band");
    }
}
