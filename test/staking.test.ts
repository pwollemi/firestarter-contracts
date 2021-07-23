/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { CustomToken, Staking } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock, advanceTime, duration, getBigNumber } from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe('Staking Pool', () => {
  const totalSupply = getBigNumber("100000000");
  const totalAmount = getBigNumber("20000000");
  const totalRewardAmount = getBigNumber("2500000");

  // to avoid complex calculation of decimals, we set an easy value
  const flamePerSecond = BigNumber.from("100000000000000000");

  let staking: Staking;
  let lpToken: CustomToken;
  let flameToken: CustomToken;

  let deployer: SignerWithAddress;
  let bob: SignerWithAddress;
  let alice: SignerWithAddress;

  let startTime: number;
  let stakingPeriod: number;

  before(async () => {
    [deployer, bob, alice] = await ethers.getSigners();
  });

  beforeEach(async () => {
    startTime = await getLatestBlockTimestamp() + 86400;

    lpToken = <CustomToken>await deployContract("CustomToken", "Flame-USDC QS LP token", "FLAME-USDC", totalSupply);
    flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    staking = <Staking>await deployProxy("Staking", flameToken.address, lpToken.address, startTime);
    stakingPeriod = (await staking.stakingPeriod()).toNumber();

    await staking.setFlamePerSecond(flamePerSecond);

    await flameToken.transfer(staking.address, totalRewardAmount);
    await flameToken.approve(staking.address, ethers.constants.MaxUint256);

    await lpToken.transfer(bob.address, totalAmount.div(5));
    await lpToken.transfer(alice.address, totalAmount.div(5));

    await lpToken.approve(staking.address, ethers.constants.MaxUint256);
    await lpToken.connect(bob).approve(staking.address, ethers.constants.MaxUint256);
    await lpToken.connect(alice).approve(staking.address, ethers.constants.MaxUint256);
  });

  describe("Deposit/withdraw reward token", () => {
    const tokenAmount = getBigNumber(1);
    
    it("Only owner can do these operation", async () => {
      await expect(staking.connect(bob).depositFLAME(tokenAmount)).to.be.revertedWith("Ownable: caller is not the owner");
      await staking.depositFLAME(tokenAmount);

      await expect(staking.connect(bob).withdrawFLAME(tokenAmount)).to.be.revertedWith("Ownable: caller is not the owner");
      await staking.withdrawFLAME(tokenAmount);
    });
  });

  describe("Set penalty period", () => {
    const newPenaltyPeriod = duration.days(20);

    it("Only owner can do these operation", async () => {
      await expect(staking.connect(bob).setEarlyWithdrawal(newPenaltyPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("It correctly updates information", async () => {
      await staking.setEarlyWithdrawal(newPenaltyPeriod);
      expect(await staking.earlyWithdrawal()).to.be.equal(newPenaltyPeriod);
    });
  });

  describe("Set Flame per second", () => {
    const newFlamePerSecond = 100;

    it("Only owner can do these operation", async () => {
      await expect(staking.connect(bob).setFlamePerSecond(newFlamePerSecond)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("It correctly updates information", async () => {
      await staking.setFlamePerSecond(newFlamePerSecond);
      expect(await staking.flamePerSecond()).to.be.equal(newFlamePerSecond);
    });
  });

  describe("Set staking info", () => {
    it("Only owner can do these operation", async () => {
      const newStartTime = startTime + stakingPeriod + duration.days(1).toNumber();
      await expect(staking.connect(bob).setStakingInfo(newStartTime, stakingPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Fails if staking is in progress", async () => {
      const newStartTime = startTime + stakingPeriod + duration.days(1).toNumber();

      // before starts
      await staking.setStakingInfo(startTime - 1, stakingPeriod);

      // after start
      await setNextBlockTimestamp(startTime);
      await expect(staking.setStakingInfo(newStartTime, stakingPeriod)).to.be.revertedWith("setStakingInfo: Staking is in progress");

      // after end
      await setNextBlockTimestamp(startTime + stakingPeriod + 1);
      await staking.setStakingInfo(startTime + stakingPeriod + 86400, stakingPeriod);
    });

    it("New startTime must be in the future", async () => {
      const curTime = await getLatestBlockTimestamp();
      await expect(staking.setStakingInfo(curTime, stakingPeriod)).to.be.revertedWith("setStakingInfo: Should be time in future");
      const newStartTime = startTime + stakingPeriod + duration.days(1).toNumber();
      await staking.setStakingInfo(newStartTime, stakingPeriod);
    });

    it("It correctly updates information", async () => {
      const newStakingPeriod = duration.days(100);
      const newStartTime = startTime + stakingPeriod + duration.days(1).toNumber();
      await expect(staking.setStakingInfo(newStartTime, newStakingPeriod))
        .to.emit(staking, "LogStakingInfo")
        .withArgs(newStartTime, newStakingPeriod);
      expect(await staking.startTime()).to.be.equal(newStartTime);
      expect(await staking.stakingPeriod()).to.be.equal(newStakingPeriod);
    });

    it("Must update lastRewardTime always", async () => {
      const newStartTime = startTime + stakingPeriod + duration.days(1).toNumber();
      await staking.setStakingInfo(newStartTime, stakingPeriod);
      expect(await staking.startTime()).to.be.equal(newStartTime);
      expect(await staking.lastRewardTime()).to.be.equal(newStartTime);

      await setNextBlockTimestamp(newStartTime + stakingPeriod + 1);
      const nextStartTime = newStartTime + stakingPeriod + 86400
      await staking.setStakingInfo(nextStartTime, stakingPeriod);
      expect(await staking.startTime()).to.be.equal(nextStartTime);
      expect(await staking.lastRewardTime()).to.be.equal(nextStartTime);
    });
  });

  describe("Deposit", () => {
    it("Pool should be open", async () => {
      // before start
      await expect(staking.deposit(getBigNumber(1), bob.address)).to.be.revertedWith("Stake: Pool is not open");
      
      // is open
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(1), bob.address);

      // after end
      await setNextBlockTimestamp(startTime + stakingPeriod + 1);
      await expect(staking.deposit(getBigNumber(1), bob.address)).to.be.revertedWith("Stake: Pool is not open");
    });

    it("Deposit 0 amount", async () => {
      await setNextBlockTimestamp(startTime);
      await expect(staking.deposit(getBigNumber(0), bob.address))
        .to.emit(staking, "Deposit")
        .withArgs(deployer.address, 0, bob.address);
    });

    it("Staking amount increases", async () => {
      const stakeAmount1 = ethers.utils.parseUnits("10", 18);
      const stakeAmount2 = ethers.utils.parseUnits("4", 18);

      await setNextBlockTimestamp(startTime);
      await staking.deposit(stakeAmount1, bob.address);

      // user info
      const userInfo1 = await staking.userInfo(bob.address);
      expect(userInfo1.amount).to.be.equal(stakeAmount1);

      await staking.deposit(stakeAmount2, bob.address);

      // user info
      const userInfo2 = await staking.userInfo(bob.address);
      expect(userInfo2.amount).to.be.equal(stakeAmount1.add(stakeAmount2));
    });
  });

  describe("PendingFlame", () => {
    /**
     * when lp supply is zero
     * before starttime
     * in progress
     * after startime
     * before new staking starttime
     * in progress of new staking
     */
     it("Should be zero when lp supply is zero", async () => {
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(0), alice.address);
      await advanceTime(86400);
      await staking.updatePool();
      expect(await staking.pendingFlame(alice.address)).to.be.equal(0);
    });

    it("Should be zero always before staking starts", async () => {
      expect(await staking.pendingFlame(alice.address)).to.be.equal(0);
      await setNextBlockTimestamp(startTime - 1);
      await staking.updatePool();
      expect(await staking.pendingFlame(alice.address)).to.be.equal(0);
    });

    it("PendingFlame should equal ExpectedFlame", async () => {
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(1), alice.address);
      await advanceTime(86400);
      // await staking.updatePool();
      await mineBlock();
      const expectedFlame = flamePerSecond.mul(86400);
      expect(await staking.pendingFlame(alice.address)).to.be.equal(expectedFlame);
    });

    it("Deposit while staking is in progress", async () => {
      const bobDeposit = getBigNumber(900);
      const aliceDeposit = getBigNumber(100);

      await setNextBlockTimestamp(startTime);
      await staking.deposit(aliceDeposit, alice.address);

      await advanceTime(86400);
      await staking.deposit(bobDeposit, bob.address);
      const rewardPerShare0 = await staking.accFlamePerShare();
      const rewardDebt = rewardPerShare0.mul(bobDeposit).div(1e12);
      await advanceTime(86400);
      await staking.updatePool();
      const rewardPerShare1 = await staking.accFlamePerShare();

      // total rewards
      const totalFlame = flamePerSecond.mul(86400 * 2);
      const bobFlame = await staking.pendingFlame(bob.address);
      const aliceFlame = await staking.pendingFlame(alice.address);
      expect(bobFlame.add(aliceFlame)).to.be.equal(totalFlame);

      const expectedBobFlame = rewardPerShare1.mul(bobDeposit).div(1e12).sub(rewardDebt);
      expect(bobFlame).to.be.equal(expectedBobFlame);
    });

    it("Staking is finished", async () => {
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(1), alice.address);
      await advanceTime(stakingPeriod + 100);
      await staking.updatePool();
      const expectedFlame = flamePerSecond.mul(stakingPeriod);
      const pendingFlame = await staking.pendingFlame(alice.address);
      expect(pendingFlame).to.be.equal(expectedFlame);
    });    

    it("New staking is set", async () => {
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(1), alice.address);
      await advanceTime(stakingPeriod + 100);
      await staking.setStakingInfo(startTime + stakingPeriod + 10000, stakingPeriod);
      const expectedFlame = flamePerSecond.mul(stakingPeriod);
      const pendingFlame = await staking.pendingFlame(alice.address);
      expect(pendingFlame).to.be.equal(expectedFlame);
    });    

    it("New staking is started", async () => {
      await setNextBlockTimestamp(startTime);
      await staking.deposit(getBigNumber(1), alice.address);
      await advanceTime(stakingPeriod + 100);

      const newStartTime = startTime + stakingPeriod + 10000;
      await staking.setStakingInfo(newStartTime, stakingPeriod);

      await setNextBlockTimestamp(newStartTime + 86400);
      await staking.updatePool();

      const expectedFlame = flamePerSecond.mul(stakingPeriod + 86400);
      const pendingFlame = await staking.pendingFlame(alice.address);
      expect(pendingFlame).to.be.equal(expectedFlame);
    });
  });
});
