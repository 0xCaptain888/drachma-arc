const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * DrachmaVault v2 unit tests
 *
 * Since the vault interacts with external contracts (USDC, EURC, USYC, StableFX),
 * we deploy mock ERC-20 tokens and mock protocol contracts to simulate the full
 * rebalance lifecycle in a local Hardhat environment.
 *
 * Mock contracts live in contracts/mocks/ and are compiled by Hardhat automatically.
 * TestableVault mirrors DrachmaVault v2 logic but accepts injectable addresses
 * (immutable instead of constant) so we can wire up mocks in tests.
 *
 * v2 changes reflected here:
 *  - TestableVault constructor takes 7 params (added signalBus, scoreOracle)
 *  - rebalance() takes 7 params (added triggerType, networkSignalValue)
 *  - dUSDC ERC20 receipt token (depositForShares / redeemShares)
 *  - updateNav() and updateReserveScore() agent functions
 *  - DecisionLog stores triggerType and networkSignalValue
 *  - Deposited event: (depositor, token, amount, dUsdcMinted)
 *  - Withdrawn event: (redeemer, dUsdcBurned, usdcOut) — only from redeemShares
 */

describe("DrachmaVault", function () {
    let owner, agent, user, newAgent;
    let usdc, eurc, usyc, stableFx, vault;

    beforeEach(async function () {
        [owner, agent, user, newAgent] = await ethers.getSigners();

        // Deploy MockERC20 for USDC
        const MockERC20Factory = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20Factory.deploy("USD Coin", "USDC");
        await usdc.waitForDeployment();

        // Deploy MockERC20 for EURC
        eurc = await MockERC20Factory.deploy("Euro Coin", "EURC");
        await eurc.waitForDeployment();

        // Deploy MockUSYC
        const MockUSYCFactory = await ethers.getContractFactory("MockUSYC");
        usyc = await MockUSYCFactory.deploy(await usdc.getAddress());
        await usyc.waitForDeployment();

        // Deploy MockStableFX
        const MockStableFXFactory = await ethers.getContractFactory("MockStableFX");
        stableFx = await MockStableFXFactory.deploy();
        await stableFx.waitForDeployment();

        // Deploy TestableVault v2 — 7 constructor args; signalBus and scoreOracle
        // are unused in tests so we pass ZeroAddress for both.
        const VaultFactory = await ethers.getContractFactory("TestableVault");
        vault = await VaultFactory.deploy(
            agent.address,
            await usdc.getAddress(),
            await eurc.getAddress(),
            await usyc.getAddress(),
            await stableFx.getAddress(),
            ethers.ZeroAddress,   // signalBus  (unused in tests)
            ethers.ZeroAddress    // scoreOracle (unused in tests)
        );
        await vault.waitForDeployment();

        // Mint tokens to owner for deposits
        await usdc.mint(owner.address, ethers.parseUnits("1000000", 6));
        await eurc.mint(owner.address, ethers.parseUnits("1000000", 6));

        // Mint tokens to StableFX so it can fulfill swaps
        await usdc.mint(await stableFx.getAddress(), ethers.parseUnits("10000000", 6));
        await eurc.mint(await stableFx.getAddress(), ethers.parseUnits("10000000", 6));

        // Mint USDC to MockUSYC so it can fulfill redemptions
        await usdc.mint(await usyc.getAddress(), ethers.parseUnits("10000000", 6));
    });

    // ─── Deployment ────────────────────────────────────────────────────────────

    describe("Deployment", function () {
        it("should set the owner to the deployer", async function () {
            expect(await vault.owner()).to.equal(owner.address);
        });

        it("should set the agent address", async function () {
            expect(await vault.agent()).to.equal(agent.address);
        });

        it("should initialize agentVersion to 0", async function () {
            expect(await vault.agentVersion()).to.equal(0);
        });

        it("should set default allocation bands", async function () {
            const b = await vault.bands();
            expect(b.usdcMin).to.equal(2000);
            expect(b.usdcMax).to.equal(6000);
            expect(b.eurcMin).to.equal(1000);
            expect(b.eurcMax).to.equal(4000);
            expect(b.usycMin).to.equal(2000);
            expect(b.usycMax).to.equal(6000);
        });

        it("should have zero decision log entries", async function () {
            expect(await vault.decisionLogLength()).to.equal(0);
        });

        it("should store signalBus and scoreOracle addresses", async function () {
            expect(await vault.signalBus()).to.equal(ethers.ZeroAddress);
            expect(await vault.scoreOracle()).to.equal(ethers.ZeroAddress);
        });

        it("should initialize navPerShare to 1_000_000 (1.000000 USDC)", async function () {
            expect(await vault.navPerShare()).to.equal(1_000_000n);
        });

        it("should initialize reserveScore to 500", async function () {
            expect(await vault.reserveScore()).to.equal(500);
        });

        it("should have dUSDC ERC20 metadata", async function () {
            expect(await vault.name()).to.equal("Drachma USDC");
            expect(await vault.symbol()).to.equal("dUSDC");
            expect(await vault.dUsdcDecimals()).to.equal(6);
        });

        it("should start with zero dUSDC supply", async function () {
            expect(await vault.totalSupply()).to.equal(0);
        });
    });

    // ─── Access Control ────────────────────────────────────────────────────────

    describe("Access Control", function () {
        it("should revert deposit from non-owner", async function () {
            const depositAmt = ethers.parseUnits("100", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await expect(
                vault.connect(user).deposit(await usdc.getAddress(), depositAmt)
            ).to.be.revertedWith("not owner");
        });

        it("should revert withdraw from non-owner", async function () {
            await expect(
                vault.connect(user).withdraw(await usdc.getAddress(), 100)
            ).to.be.revertedWith("not owner");
        });

        it("should revert updateBands from non-owner", async function () {
            await expect(
                vault.connect(user).updateBands({
                    usdcMin: 1000, usdcMax: 5000,
                    eurcMin: 1000, eurcMax: 5000,
                    usycMin: 1000, usycMax: 5000
                })
            ).to.be.revertedWith("not owner");
        });

        it("should revert rotateAgent from non-owner", async function () {
            await expect(
                vault.connect(user).rotateAgent(newAgent.address)
            ).to.be.revertedWith("not owner");
        });

        it("should revert rebalance from non-agent", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(owner).rebalance(4000, 2000, 4000, cid, 0, 0, 0)
            ).to.be.revertedWith("not agent");
        });

        it("should revert emergencyExit from non-agent", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(owner).emergencyExit(cid)
            ).to.be.revertedWith("not agent");
        });

        it("should revert updateNav from non-agent", async function () {
            await expect(
                vault.connect(owner).updateNav()
            ).to.be.revertedWith("not agent");
        });

        it("should revert updateReserveScore from non-agent", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("evidence-cid"));
            await expect(
                vault.connect(owner).updateReserveScore(700, cid)
            ).to.be.revertedWith("not agent");
        });
    });

    // ─── Deposit & Withdraw (owner treasury operations) ────────────────────────

    describe("Deposit & Withdraw", function () {
        const depositAmt = ethers.parseUnits("10000", 6);

        it("should accept USDC deposits from owner and emit Deposited", async function () {
            await usdc.approve(await vault.getAddress(), depositAmt);
            await expect(vault.deposit(await usdc.getAddress(), depositAmt))
                .to.emit(vault, "Deposited")
                .withArgs(owner.address, await usdc.getAddress(), depositAmt, 0);

            expect(await usdc.balanceOf(await vault.getAddress())).to.equal(depositAmt);
        });

        it("should accept EURC deposits from owner and emit Deposited", async function () {
            await eurc.approve(await vault.getAddress(), depositAmt);
            await expect(vault.deposit(await eurc.getAddress(), depositAmt))
                .to.emit(vault, "Deposited")
                .withArgs(owner.address, await eurc.getAddress(), depositAmt, 0);

            expect(await eurc.balanceOf(await vault.getAddress())).to.equal(depositAmt);
        });

        it("should reject deposit of unsupported tokens", async function () {
            await expect(
                vault.deposit(await usyc.getAddress(), depositAmt)
            ).to.be.revertedWith("unsupported token");
        });

        it("should allow owner to withdraw USDC", async function () {
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const withdrawAmt = ethers.parseUnits("5000", 6);
            // v2 owner withdraw() has no event; just check balances
            await vault.withdraw(await usdc.getAddress(), withdrawAmt);

            expect(await usdc.balanceOf(await vault.getAddress())).to.equal(
                depositAmt - withdrawAmt
            );
        });

        it("should allow owner to withdraw EURC", async function () {
            await eurc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await eurc.getAddress(), depositAmt);

            const withdrawAmt = ethers.parseUnits("3000", 6);
            await vault.withdraw(await eurc.getAddress(), withdrawAmt);

            expect(await eurc.balanceOf(await vault.getAddress())).to.equal(
                depositAmt - withdrawAmt
            );
        });

        it("should reject withdrawal of unsupported token addresses", async function () {
            await expect(
                vault.withdraw(ethers.ZeroAddress, 100)
            ).to.be.revertedWith("unsupported");
        });
    });

    // ─── Allocation Bands ──────────────────────────────────────────────────────

    describe("Allocation Bands", function () {
        it("should allow owner to update bands", async function () {
            await vault.updateBands({
                usdcMin: 3000, usdcMax: 7000,
                eurcMin: 500,  eurcMax: 3000,
                usycMin: 1000, usycMax: 5000
            });
            const b = await vault.bands();
            expect(b.usdcMin).to.equal(3000);
            expect(b.usdcMax).to.equal(7000);
            expect(b.eurcMin).to.equal(500);
            expect(b.eurcMax).to.equal(3000);
            expect(b.usycMin).to.equal(1000);
            expect(b.usycMax).to.equal(5000);
        });

        it("should reject rebalance targets outside bands (USDC below min)", async function () {
            // Default bands: USDC 20-60%, EURC 10-40%, USYC 20-60%
            // Try USDC at 10% (below 20% min)
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(agent).rebalance(1000, 4000, 5000, cid, 0, 0, 0)
            ).to.be.revertedWith("USDC out of band");
        });

        it("should reject rebalance with EURC out of band", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            // EURC at 5% (below 10% min)
            await expect(
                vault.connect(agent).rebalance(4500, 500, 5000, cid, 0, 0, 0)
            ).to.be.revertedWith("EURC out of band");
        });

        it("should reject rebalance with USYC out of band", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            // USYC at 10% (below 20% min)
            await expect(
                vault.connect(agent).rebalance(5000, 4000, 1000, cid, 0, 0, 0)
            ).to.be.revertedWith("USYC out of band");
        });
    });

    // ─── Agent Rotation ────────────────────────────────────────────────────────

    describe("Agent Rotation", function () {
        it("should rotate agent and increment version", async function () {
            await expect(vault.rotateAgent(newAgent.address))
                .to.emit(vault, "AgentRotated")
                .withArgs(agent.address, newAgent.address);

            expect(await vault.agent()).to.equal(newAgent.address);
            expect(await vault.agentVersion()).to.equal(1);
        });

        it("should allow multiple rotations with incrementing version", async function () {
            await vault.rotateAgent(newAgent.address);
            await vault.rotateAgent(user.address);
            expect(await vault.agent()).to.equal(user.address);
            expect(await vault.agentVersion()).to.equal(2);
        });

        it("should prevent old agent from calling rebalance after rotation", async function () {
            await vault.rotateAgent(newAgent.address);
            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0)
            ).to.be.revertedWith("not agent");
        });
    });

    // ─── Rebalance ─────────────────────────────────────────────────────────────

    describe("Rebalance", function () {
        const depositAmt = ethers.parseUnits("100000", 6);
        const cid = ethers.keccak256(ethers.toUtf8Bytes("reasoning-trace-cid-v1"));

        beforeEach(async function () {
            // Deposit 100k USDC into the vault
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);
        });

        it("should reject allocations that do not sum to 10000 bps", async function () {
            await expect(
                vault.connect(agent).rebalance(4000, 2000, 3000, cid, 0, 0, 0)
            ).to.be.revertedWith("alloc != 100%");
        });

        it("should execute a valid rebalance and emit Rebalanced event", async function () {
            // Target: 40% USDC, 20% EURC, 40% USYC; triggerType=0 (scheduled)
            const tx = await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            await expect(tx).to.emit(vault, "Rebalanced");

            // Check decision log was appended
            expect(await vault.decisionLogLength()).to.equal(1);

            // Read the log entry
            const entry = await vault.log(0);
            expect(entry.action).to.equal(0); // rebalance
            expect(entry.reasoningCID).to.equal(cid);
        });

        it("should store correct before-allocation in the log (100% USDC initially)", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            const entry = await vault.log(0);
            // Before rebalance, vault had 100% USDC
            expect(entry.usdcBpsBefore).to.equal(10000);
            expect(entry.eurcBpsBefore).to.equal(0);
            expect(entry.usycBpsBefore).to.equal(0);
        });

        it("should move funds into EURC and USYC after rebalance", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);

            const vaultAddr = await vault.getAddress();
            const usdcBal = await usdc.balanceOf(vaultAddr);
            const eurcBal = await eurc.balanceOf(vaultAddr);
            const usycBal = await usyc.balanceOf(vaultAddr);

            // After rebalance, vault should have distributed funds
            // USDC should be less than the full deposit
            expect(usdcBal).to.be.lt(depositAmt);
            // EURC or USYC should have non-zero balances
            expect(eurcBal > 0n || usycBal > 0n).to.be.true;
        });

        it("should allow multiple rebalances and grow the log", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            const cid2 = ethers.keccak256(ethers.toUtf8Bytes("reasoning-trace-v2"));
            await vault.connect(agent).rebalance(3000, 3000, 4000, cid2, 0, 0, 0);
            expect(await vault.decisionLogLength()).to.equal(2);

            const entry1 = await vault.log(1);
            expect(entry1.reasoningCID).to.equal(cid2);
        });
    });

    // ─── Emergency Exit ────────────────────────────────────────────────────────

    describe("Emergency Exit", function () {
        const depositAmt = ethers.parseUnits("100000", 6);
        const cid = ethers.keccak256(ethers.toUtf8Bytes("emergency-reasoning"));

        beforeEach(async function () {
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);
        });

        it("should emit EmergencyExit event", async function () {
            await expect(vault.connect(agent).emergencyExit(cid))
                .to.emit(vault, "EmergencyExit");
        });

        it("should log the exit with action=2 and triggerType=2", async function () {
            await vault.connect(agent).emergencyExit(cid);
            const entry = await vault.log(0);
            expect(entry.action).to.equal(2);
            expect(entry.usdcBpsAfter).to.equal(10000);
            expect(entry.eurcBpsAfter).to.equal(0);
            expect(entry.usycBpsAfter).to.equal(0);
            expect(entry.reasoningCID).to.equal(cid);
            expect(entry.triggerType).to.equal(2);      // urgent
            expect(entry.networkSignalValue).to.equal(0);
        });

        it("should convert all holdings to USDC on emergency exit", async function () {
            // First rebalance to distribute funds
            const rebalCid = ethers.keccak256(ethers.toUtf8Bytes("rebal-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, rebalCid, 0, 0, 0);

            const vaultAddr = await vault.getAddress();

            // Verify we have some EURC/USYC
            expect(await eurc.balanceOf(vaultAddr)).to.be.gt(0);

            // Emergency exit
            await vault.connect(agent).emergencyExit(cid);

            // After exit, EURC and USYC should be zero
            expect(await eurc.balanceOf(vaultAddr)).to.equal(0);
            expect(await usyc.balanceOf(vaultAddr)).to.equal(0);

            // USDC should hold recovered funds
            const usdcAfter = await usdc.balanceOf(vaultAddr);
            expect(usdcAfter).to.be.gt(0);
        });
    });

    // ─── View Functions ────────────────────────────────────────────────────────

    describe("View Functions", function () {
        it("should return correct totalAum after deposit", async function () {
            const depositAmt = ethers.parseUnits("50000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const aum = await vault.totalAum();
            expect(aum.usdc).to.equal(depositAmt);
            expect(aum.eurc).to.equal(0);
            expect(aum.usyc).to.equal(0);
            expect(aum.totalInUsdc).to.equal(depositAmt);
        });

        it("should return zero AUM for empty vault", async function () {
            const aum = await vault.totalAum();
            expect(aum.totalInUsdc).to.equal(0);
        });

        it("should return correct decisionLogLength", async function () {
            expect(await vault.decisionLogLength()).to.equal(0);

            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            expect(await vault.decisionLogLength()).to.equal(1);
        });

        it("should return share value for a holder via getShareValue", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await vault.connect(user).depositForShares(depositAmt);

            const { dUsdcBalance, usdcValue } = await vault.getShareValue(user.address);
            expect(dUsdcBalance).to.equal(depositAmt); // navPerShare=1 at start
            expect(usdcValue).to.equal(depositAmt);
        });
    });

    // ─── dUSDC ERC20 ───────────────────────────────────────────────────────────

    describe("dUSDC ERC20", function () {
        const mintAmt = ethers.parseUnits("5000", 6);

        beforeEach(async function () {
            // Give user USDC and deposit for shares so they have dUSDC to test with
            await usdc.mint(user.address, mintAmt);
            await usdc.connect(user).approve(await vault.getAddress(), mintAmt);
            await vault.connect(user).depositForShares(mintAmt);
        });

        it("should reflect correct balanceOf after depositForShares", async function () {
            expect(await vault.balanceOf(user.address)).to.equal(mintAmt);
        });

        it("should transfer dUSDC between accounts", async function () {
            const transferAmt = ethers.parseUnits("1000", 6);
            await expect(vault.connect(user).transfer(newAgent.address, transferAmt))
                .to.emit(vault, "Transfer")
                .withArgs(user.address, newAgent.address, transferAmt);

            expect(await vault.balanceOf(user.address)).to.equal(mintAmt - transferAmt);
            expect(await vault.balanceOf(newAgent.address)).to.equal(transferAmt);
        });

        it("should revert transfer when balance is insufficient", async function () {
            const tooMuch = mintAmt + 1n;
            await expect(
                vault.connect(user).transfer(newAgent.address, tooMuch)
            ).to.be.revertedWith("insufficient");
        });

        it("should set and read allowance via approve", async function () {
            const allowanceAmt = ethers.parseUnits("2000", 6);
            await expect(vault.connect(user).approve(newAgent.address, allowanceAmt))
                .to.emit(vault, "Approval")
                .withArgs(user.address, newAgent.address, allowanceAmt);

            expect(await vault.allowance(user.address, newAgent.address)).to.equal(allowanceAmt);
        });

        it("should execute transferFrom within allowance", async function () {
            const allowanceAmt = ethers.parseUnits("2000", 6);
            await vault.connect(user).approve(newAgent.address, allowanceAmt);

            await expect(
                vault.connect(newAgent).transferFrom(user.address, owner.address, allowanceAmt)
            )
                .to.emit(vault, "Transfer")
                .withArgs(user.address, owner.address, allowanceAmt);

            expect(await vault.balanceOf(user.address)).to.equal(mintAmt - allowanceAmt);
            expect(await vault.balanceOf(owner.address)).to.equal(allowanceAmt);
            expect(await vault.allowance(user.address, newAgent.address)).to.equal(0);
        });

        it("should revert transferFrom when allowance is insufficient", async function () {
            const allowanceAmt = ethers.parseUnits("500", 6);
            await vault.connect(user).approve(newAgent.address, allowanceAmt);

            await expect(
                vault.connect(newAgent).transferFrom(
                    user.address, owner.address, allowanceAmt + 1n
                )
            ).to.be.revertedWith("allowance");
        });

        it("should revert transferFrom when sender balance is insufficient", async function () {
            // Approve more than the user actually has
            const overApprove = mintAmt + ethers.parseUnits("1000", 6);
            await vault.connect(user).approve(newAgent.address, overApprove);

            await expect(
                vault.connect(newAgent).transferFrom(user.address, owner.address, overApprove)
            ).to.be.revertedWith("insufficient");
        });
    });

    // ─── depositForShares ──────────────────────────────────────────────────────

    describe("depositForShares", function () {
        it("should mint dUSDC proportional to deposit at initial NAV", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);

            // navPerShare starts at 1_000_000 so dShares = usdcAmount * 1e6 / 1e6 = usdcAmount
            await expect(vault.connect(user).depositForShares(depositAmt))
                .to.emit(vault, "Deposited")
                .withArgs(user.address, await usdc.getAddress(), depositAmt, depositAmt)
                .and.to.emit(vault, "Transfer")
                .withArgs(ethers.ZeroAddress, user.address, depositAmt);

            expect(await vault.balanceOf(user.address)).to.equal(depositAmt);
            expect(await vault.totalSupply()).to.equal(depositAmt);
        });

        it("should increase vault USDC balance after depositForShares", async function () {
            const depositAmt = ethers.parseUnits("20000", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await vault.connect(user).depositForShares(depositAmt);

            expect(await usdc.balanceOf(await vault.getAddress())).to.equal(depositAmt);
        });

        it("should revert depositForShares with zero amount", async function () {
            await expect(
                vault.connect(user).depositForShares(0)
            ).to.be.revertedWith("zero deposit");
        });

        it("should compute correct dUSDC shares after NAV has changed", async function () {
            // First depositor gets 1:1 shares
            const first = ethers.parseUnits("10000", 6);
            await usdc.mint(user.address, first);
            await usdc.connect(user).approve(await vault.getAddress(), first);
            await vault.connect(user).depositForShares(first);

            // Simulate yield: send extra USDC directly to vault (NAV rises)
            const yieldAmt = ethers.parseUnits("1000", 6); // +10% yield
            await usdc.mint(await vault.getAddress(), yieldAmt);

            // Agent updates NAV: navPerShare = 11000 / 10000 * 1e6 = 1_100_000
            await vault.connect(agent).updateNav();
            const newNav = await vault.navPerShare();
            expect(newNav).to.equal(1_100_000n);

            // Second depositor: 5500 USDC should give 5500 * 1e6 / 1_100_000 = 5000 shares
            const second = ethers.parseUnits("5500", 6);
            await usdc.mint(newAgent.address, second);
            await usdc.connect(newAgent).approve(await vault.getAddress(), second);
            await vault.connect(newAgent).depositForShares(second);

            expect(await vault.balanceOf(newAgent.address)).to.equal(
                ethers.parseUnits("5000", 6)
            );
        });

        it("should accumulate totalSupply across multiple depositors", async function () {
            const amt = ethers.parseUnits("1000", 6);
            for (const signer of [owner, user, newAgent]) {
                await usdc.mint(signer.address, amt);
                await usdc.connect(signer).approve(await vault.getAddress(), amt);
                await vault.connect(signer).depositForShares(amt);
            }
            // 3 depositors × 1000 USDC each, navPerShare=1 → 3000 dUSDC total
            expect(await vault.totalSupply()).to.equal(ethers.parseUnits("3000", 6));
        });
    });

    // ─── redeemShares ─────────────────────────────────────────────────────────

    describe("redeemShares", function () {
        const depositAmt = ethers.parseUnits("10000", 6);

        beforeEach(async function () {
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await vault.connect(user).depositForShares(depositAmt);
        });

        it("should return USDC and burn dUSDC on full redeem", async function () {
            const shares = await vault.balanceOf(user.address);
            const usdcBefore = await usdc.balanceOf(user.address);

            await expect(vault.connect(user).redeemShares(shares))
                .to.emit(vault, "Withdrawn")
                .withArgs(user.address, shares, depositAmt)
                .and.to.emit(vault, "Transfer")
                .withArgs(user.address, ethers.ZeroAddress, shares);

            expect(await vault.balanceOf(user.address)).to.equal(0);
            expect(await vault.totalSupply()).to.equal(0);
            expect(await usdc.balanceOf(user.address)).to.equal(usdcBefore + depositAmt);
        });

        it("should allow partial redemption", async function () {
            const halfShares = depositAmt / 2n;
            await vault.connect(user).redeemShares(halfShares);

            expect(await vault.balanceOf(user.address)).to.equal(halfShares);
            expect(await vault.totalSupply()).to.equal(halfShares);
            // USDC returned = halfShares * navPerShare / 1e6 = halfShares (at nav=1)
            expect(await usdc.balanceOf(user.address)).to.equal(halfShares);
        });

        it("should revert when redeeming more shares than held", async function () {
            const tooMany = depositAmt + 1n;
            await expect(
                vault.connect(user).redeemShares(tooMany)
            ).to.be.revertedWith("insufficient shares");
        });

        it("should revert when vault lacks liquid USDC", async function () {
            // Deposit into vault, then drain USDC by doing a direct owner withdraw
            // so vault has no liquid USDC to honor the redemption
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt); // owner adds extra first

            // Owner withdraws all USDC (including user's deposit)
            const vaultAddr = await vault.getAddress();
            const totalUsdc = await usdc.balanceOf(vaultAddr);
            await vault.withdraw(await usdc.getAddress(), totalUsdc);

            // User tries to redeem — vault has no USDC
            const shares = await vault.balanceOf(user.address);
            await expect(
                vault.connect(user).redeemShares(shares)
            ).to.be.revertedWith("insufficient liquidity");
        });
    });

    // ─── updateNav ────────────────────────────────────────────────────────────

    describe("updateNav", function () {
        it("should emit NavUpdated and keep navPerShare at 1e6 with no supply", async function () {
            // No shares minted; nav stays at initial value
            await expect(vault.connect(agent).updateNav())
                .to.emit(vault, "NavUpdated")
                .withArgs(1_000_000n, 0n);

            expect(await vault.navPerShare()).to.equal(1_000_000n);
        });

        it("should update navPerShare based on AUM / totalSupply", async function () {
            // Deposit 10 000 USDC for shares (navPerShare = 1e6, so 10 000 dUSDC minted)
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await vault.connect(user).depositForShares(depositAmt);

            // Simulate 500 USDC yield deposited directly into vault
            const yield_ = ethers.parseUnits("500", 6);
            await usdc.mint(await vault.getAddress(), yield_);

            // updateNav: navPerShare = 10500 * 1e6 / 10000 = 1_050_000
            await expect(vault.connect(agent).updateNav())
                .to.emit(vault, "NavUpdated")
                .withArgs(1_050_000n, depositAmt + yield_);

            expect(await vault.navPerShare()).to.equal(1_050_000n);
        });

        it("should update navPerShare after a rebalance that captures yield via USYC", async function () {
            const depositAmt = ethers.parseUnits("100000", 6);
            await usdc.mint(user.address, depositAmt);
            await usdc.connect(user).approve(await vault.getAddress(), depositAmt);
            await vault.connect(user).depositForShares(depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("rebal-nav-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);

            // MockUSYC navPerShare = 1.02e18, so USYC holdings are worth > their USDC cost
            // Calling updateNav should reflect any mark-to-market change
            const tx = await vault.connect(agent).updateNav();
            await expect(tx).to.emit(vault, "NavUpdated");
        });
    });

    // ─── updateReserveScore ───────────────────────────────────────────────────

    describe("updateReserveScore", function () {
        it("should update reserveScore and emit ScoreUpdated", async function () {
            const evidenceCID = ethers.keccak256(ethers.toUtf8Bytes("score-evidence-cid"));
            await expect(vault.connect(agent).updateReserveScore(750, evidenceCID))
                .to.emit(vault, "ScoreUpdated")
                .withArgs(500, 750, evidenceCID); // old=500 (default), new=750

            expect(await vault.reserveScore()).to.equal(750);
        });

        it("should allow setting score to 0 (minimum)", async function () {
            const evidenceCID = ethers.keccak256(ethers.toUtf8Bytes("min-score"));
            await vault.connect(agent).updateReserveScore(0, evidenceCID);
            expect(await vault.reserveScore()).to.equal(0);
        });

        it("should allow setting score to 1000 (maximum)", async function () {
            const evidenceCID = ethers.keccak256(ethers.toUtf8Bytes("max-score"));
            await vault.connect(agent).updateReserveScore(1000, evidenceCID);
            expect(await vault.reserveScore()).to.equal(1000);
        });

        it("should revert when score exceeds 1000", async function () {
            const evidenceCID = ethers.keccak256(ethers.toUtf8Bytes("bad-score"));
            await expect(
                vault.connect(agent).updateReserveScore(1001, evidenceCID)
            ).to.be.revertedWith("score > 1000");
        });

        it("should emit ScoreUpdated with correct old value across multiple updates", async function () {
            const cid1 = ethers.keccak256(ethers.toUtf8Bytes("cid-1"));
            const cid2 = ethers.keccak256(ethers.toUtf8Bytes("cid-2"));
            await vault.connect(agent).updateReserveScore(600, cid1);
            await expect(vault.connect(agent).updateReserveScore(800, cid2))
                .to.emit(vault, "ScoreUpdated")
                .withArgs(600, 800, cid2);
        });
    });

    // ─── DecisionLog v2 fields ────────────────────────────────────────────────

    describe("DecisionLog v2 fields", function () {
        const depositAmt = ethers.parseUnits("100000", 6);

        beforeEach(async function () {
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);
        });

        it("should store triggerType=0 (scheduled) in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("scheduled-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            const entry = await vault.log(0);
            expect(entry.triggerType).to.equal(0); // scheduled
        });

        it("should store triggerType=1 (consensus) in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("consensus-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 1, 0);
            const entry = await vault.log(0);
            expect(entry.triggerType).to.equal(1); // consensus
        });

        it("should store triggerType=2 (urgent) in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("urgent-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 2, 0);
            const entry = await vault.log(0);
            expect(entry.triggerType).to.equal(2); // urgent
        });

        it("should store triggerType=3 (conversation) in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("convo-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 3, 0);
            const entry = await vault.log(0);
            expect(entry.triggerType).to.equal(3); // conversation
        });

        it("should store positive networkSignalValue in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("positive-signal-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 1, 250);
            const entry = await vault.log(0);
            expect(entry.networkSignalValue).to.equal(250);
        });

        it("should store negative networkSignalValue in log entry", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("negative-signal-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 2, -150);
            const entry = await vault.log(0);
            expect(entry.networkSignalValue).to.equal(-150);
        });

        it("should store zero networkSignalValue when omitted", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("zero-signal-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 0, 0);
            const entry = await vault.log(0);
            expect(entry.networkSignalValue).to.equal(0);
        });

        it("should emit Rebalanced with correct logIndex, cid, and triggerType", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("event-trigger-cid"));
            // The AUM arg in the event reflects post-rebalance mark-to-market (USYC at 1.02x),
            // so we check the other fields precisely and accept any non-zero AUM value.
            const tx = await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0, 1, 42);
            const receipt = await tx.wait();
            const iface = vault.interface;
            const rebalancedEvent = receipt.logs
                .map(l => { try { return iface.parseLog(l); } catch { return null; } })
                .find(e => e && e.name === "Rebalanced");

            expect(rebalancedEvent).to.not.be.null;
            expect(rebalancedEvent.args[0]).to.equal(0n);           // logIndex
            expect(rebalancedEvent.args[1]).to.equal(cid);          // reasoningCID
            expect(rebalancedEvent.args[2]).to.be.gt(0n);           // totalAumUsdc > 0
            expect(rebalancedEvent.args[3]).to.equal(1);            // triggerType = consensus
        });

        it("should preserve v2 fields independently across multiple log entries", async function () {
            const cid1 = ethers.keccak256(ethers.toUtf8Bytes("log-entry-1"));
            const cid2 = ethers.keccak256(ethers.toUtf8Bytes("log-entry-2"));

            await vault.connect(agent).rebalance(4000, 2000, 4000, cid1, 0, 0,  100);
            await vault.connect(agent).rebalance(3000, 3000, 4000, cid2, 0, 3, -200);

            const e0 = await vault.log(0);
            expect(e0.triggerType).to.equal(0);
            expect(e0.networkSignalValue).to.equal(100);

            const e1 = await vault.log(1);
            expect(e1.triggerType).to.equal(3);
            expect(e1.networkSignalValue).to.equal(-200);
        });
    });

    // ─── DrachmaVault original compilation check ───────────────────────────────

    describe("Original DrachmaVault compilation", function () {
        it("should have the DrachmaVault artifact available (proves compilation)", async function () {
            const factory = await ethers.getContractFactory("DrachmaVault");
            expect(factory).to.not.be.undefined;
        });
    });
});
