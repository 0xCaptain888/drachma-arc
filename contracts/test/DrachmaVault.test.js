const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * DrachmaVault unit tests
 *
 * Since the vault interacts with external contracts (USDC, EURC, USYC, StableFX),
 * we deploy mock ERC-20 tokens and mock protocol contracts to simulate the full
 * rebalance lifecycle in a local Hardhat environment.
 *
 * Mock contracts live in contracts/mocks/ and are compiled by Hardhat automatically.
 * TestableVault mirrors DrachmaVault logic but accepts injectable addresses
 * (immutable instead of constant) so we can wire up mocks in tests.
 */

// Mock contracts are in contracts/mocks/*.sol and compiled by Hardhat.
// TestableVault mirrors DrachmaVault but uses immutable (not constant) addresses.
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

        // Deploy TestableVault
        const VaultFactory = await ethers.getContractFactory("TestableVault");
        vault = await VaultFactory.deploy(
            agent.address,
            await usdc.getAddress(),
            await eurc.getAddress(),
            await usyc.getAddress(),
            await stableFx.getAddress()
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
                vault.connect(owner).rebalance(4000, 2000, 4000, cid, 0)
            ).to.be.revertedWith("not agent");
        });

        it("should revert emergencyExit from non-agent", async function () {
            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(owner).emergencyExit(cid)
            ).to.be.revertedWith("not agent");
        });
    });

    // ─── Deposit & Withdraw ────────────────────────────────────────────────────

    describe("Deposit & Withdraw", function () {
        const depositAmt = ethers.parseUnits("10000", 6);

        it("should accept USDC deposits from owner", async function () {
            await usdc.approve(await vault.getAddress(), depositAmt);
            await expect(vault.deposit(await usdc.getAddress(), depositAmt))
                .to.emit(vault, "Deposited")
                .withArgs(await usdc.getAddress(), depositAmt);

            expect(await usdc.balanceOf(await vault.getAddress())).to.equal(depositAmt);
        });

        it("should accept EURC deposits from owner", async function () {
            await eurc.approve(await vault.getAddress(), depositAmt);
            await expect(vault.deposit(await eurc.getAddress(), depositAmt))
                .to.emit(vault, "Deposited")
                .withArgs(await eurc.getAddress(), depositAmt);

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
            await expect(vault.withdraw(await usdc.getAddress(), withdrawAmt))
                .to.emit(vault, "Withdrawn")
                .withArgs(await usdc.getAddress(), withdrawAmt);

            expect(await usdc.balanceOf(await vault.getAddress())).to.equal(
                depositAmt - withdrawAmt
            );
        });

        it("should allow owner to withdraw EURC", async function () {
            await eurc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await eurc.getAddress(), depositAmt);

            const withdrawAmt = ethers.parseUnits("3000", 6);
            await expect(vault.withdraw(await eurc.getAddress(), withdrawAmt))
                .to.emit(vault, "Withdrawn")
                .withArgs(await eurc.getAddress(), withdrawAmt);
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

        it("should reject bands with max > 10000", async function () {
            await expect(
                vault.updateBands({
                    usdcMin: 0, usdcMax: 10001,
                    eurcMin: 0, eurcMax: 5000,
                    usycMin: 0, usycMax: 5000
                })
            ).to.be.revertedWith("overflow");
        });

        it("should reject rebalance targets outside bands", async function () {
            // Default bands: USDC 20-60%, EURC 10-40%, USYC 20-60%
            // Try USDC at 10% (below 20% min)
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            await expect(
                vault.connect(agent).rebalance(1000, 4000, 5000, cid, 0)
            ).to.be.revertedWith("USDC out of band");
        });

        it("should reject rebalance with EURC out of band", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            // EURC at 5% (below 10% min)
            await expect(
                vault.connect(agent).rebalance(4500, 500, 5000, cid, 0)
            ).to.be.revertedWith("EURC out of band");
        });

        it("should reject rebalance with USYC out of band", async function () {
            const depositAmt = ethers.parseUnits("10000", 6);
            await usdc.approve(await vault.getAddress(), depositAmt);
            await vault.deposit(await usdc.getAddress(), depositAmt);

            const cid = ethers.keccak256(ethers.toUtf8Bytes("test-cid"));
            // USYC at 10% (below 20% min)
            await expect(
                vault.connect(agent).rebalance(5000, 4000, 1000, cid, 0)
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
                vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0)
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
                vault.connect(agent).rebalance(4000, 2000, 3000, cid, 0)
            ).to.be.revertedWith("alloc != 100%");
        });

        it("should execute a valid rebalance and emit Rebalanced event", async function () {
            // Target: 40% USDC, 20% EURC, 40% USYC
            const tx = await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0);
            await expect(tx).to.emit(vault, "Rebalanced");

            // Check decision log was appended
            expect(await vault.decisionLogLength()).to.equal(1);

            // Read the log entry
            const entry = await vault.log(0);
            expect(entry.action).to.equal(0); // rebalance
            expect(entry.reasoningCID).to.equal(cid);
        });

        it("should store correct before-allocation in the log (100% USDC initially)", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0);
            const entry = await vault.log(0);
            // Before rebalance, vault had 100% USDC
            expect(entry.usdcBpsBefore).to.equal(10000);
            expect(entry.eurcBpsBefore).to.equal(0);
            expect(entry.usycBpsBefore).to.equal(0);
        });

        it("should move funds into EURC and USYC after rebalance", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0);

            const vaultAddr = await vault.getAddress();
            const usdcBal = await usdc.balanceOf(vaultAddr);
            const eurcBal = await eurc.balanceOf(vaultAddr);
            const usycBal = await usyc.balanceOf(vaultAddr);

            // After rebalance, vault should have distributed funds
            // USDC should be less than the full deposit
            expect(usdcBal).to.be.lt(depositAmt);
            // EURC or USYC should have non-zero balances
            expect(eurcBal > 0 || usycBal > 0).to.be.true;
        });

        it("should allow multiple rebalances and grow the log", async function () {
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0);
            const cid2 = ethers.keccak256(ethers.toUtf8Bytes("reasoning-trace-v2"));
            await vault.connect(agent).rebalance(3000, 3000, 4000, cid2, 0);
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

        it("should log the exit with action=2", async function () {
            await vault.connect(agent).emergencyExit(cid);
            const entry = await vault.log(0);
            expect(entry.action).to.equal(2);
            expect(entry.usdcBpsAfter).to.equal(10000);
            expect(entry.eurcBpsAfter).to.equal(0);
            expect(entry.usycBpsAfter).to.equal(0);
            expect(entry.reasoningCID).to.equal(cid);
        });

        it("should convert all holdings to USDC on emergency exit", async function () {
            // First rebalance to distribute funds
            const rebalCid = ethers.keccak256(ethers.toUtf8Bytes("rebal-cid"));
            await vault.connect(agent).rebalance(4000, 2000, 4000, rebalCid, 0);

            const vaultAddr = await vault.getAddress();

            // Verify we have some EURC/USYC
            const eurcBefore = await eurc.balanceOf(vaultAddr);
            const usycBefore = await usyc.balanceOf(vaultAddr);

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
            await vault.connect(agent).rebalance(4000, 2000, 4000, cid, 0);
            expect(await vault.decisionLogLength()).to.equal(1);
        });
    });

    // ─── DrachmaVault (original) compilation check ─────────────────────────────

    describe("Original DrachmaVault compilation", function () {
        it("should have the DrachmaVault artifact available (proves compilation)", async function () {
            const factory = await ethers.getContractFactory("DrachmaVault");
            expect(factory).to.not.be.undefined;
        });
    });
});
