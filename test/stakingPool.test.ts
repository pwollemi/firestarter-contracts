/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { CustomToken, StakingPool } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe('Staking Pool', () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);
  const oneYear = 365 * 86400;
  const rewardAPY = 40;

  let stakingPool: StakingPool;
  let lpToken: CustomToken;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];
  let startTime: number;
  let stakingPeriod: number;

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    startTime = await getLatestBlockTimestamp() + 1000;

    lpToken = <CustomToken>await deployContract("CustomToken", "Flame-USDC QS LP token", "FLAME-USDC", totalSupply);
    flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    stakingPool = <StakingPool>await deployProxy("StakingPool", lpToken.address, flameToken.address, startTime, rewardAPY);
    stakingPeriod = (await stakingPool.stakingPeriod()).toNumber();

    await flameToken.transfer(stakingPool.address, ethers.utils.parseUnits("2500000", 18));
    await flameToken.approve(stakingPool.address, ethers.constants.MaxUint256);

    await lpToken.transfer(signers[1].address, totalAmount.div(5));
    await lpToken.transfer(signers[2].address, totalAmount.div(5));
    await lpToken.transfer(signers[3].address, totalAmount.div(5));

    await lpToken.connect(signers[1]).approve(stakingPool.address, totalAmount.div(5));
    await lpToken.connect(signers[2]).approve(stakingPool.address, totalAmount.div(5));
    await lpToken.connect(signers[3]).approve(stakingPool.address, totalAmount.div(5));
  });

  describe("Update staking params", () => {
    const newAPY = 50;
    const newPenaltyPeriod = 50 * 86400;
    const newStakingPeriod = 100 * 86400;

    it("Only owner can do these operation", async () => {
      await expect(stakingPool.connect(signers[1]).updateAPY(newAPY)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(stakingPool.connect(signers[1]).updateEarlyWithdrawal(newPenaltyPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(stakingPool.connect(signers[1]).updateStakingPeriod(newStakingPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("It correctly updates information", async () => {
      await stakingPool.updateAPY(newAPY);
      await stakingPool.updateEarlyWithdrawal(newPenaltyPeriod);
      await stakingPool.updateStakingPeriod(newStakingPeriod);

      expect(await stakingPool.rewardAPY()).to.be.equal(newAPY);
      expect(await stakingPool.earlyWithdrawal()).to.be.equal(newPenaltyPeriod);
      expect(await stakingPool.stakingPeriod()).to.be.equal(newStakingPeriod);
    });
  });

  describe("deposit/withdraw reward token", () => {
    const tokenAmount = ethers.utils.parseUnits("1", 18);
    
    it("Only owner can do these operation", async () => {
      await expect(stakingPool.connect(signers[1]).depositRewardToken(tokenAmount)).to.be.revertedWith("Ownable: caller is not the owner");
      await stakingPool.depositRewardToken(tokenAmount);

      await expect(stakingPool.connect(signers[1]).withdrawRewardToken(tokenAmount)).to.be.revertedWith("Ownable: caller is not the owner");
      await stakingPool.withdrawRewardToken(tokenAmount);
    });
  });

  describe("setStartTime", () => {
    it("Only owner can do these operation", async () => {
      await expect(stakingPool.connect(signers[1]).setStartTime(startTime + 100)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set start time if staking is in progress", async () => {
      await setNextBlockTimestamp(startTime);
      await expect(stakingPool.setStartTime(startTime + 100)).to.be.revertedWith("setStartTime: Staking is in progress");
    });

    it("Should be in the future", async () => {
      const curTime = await getLatestBlockTimestamp();
      await expect(stakingPool.setStartTime(curTime)).to.be.revertedWith("setStartTime: Should be time in future");
    });

    it("Updates before startTime with correct event", async () => {
      await expect(stakingPool.setStartTime(startTime + 100))
        .to.emit(stakingPool, "StartTimeSet")
        .withArgs(startTime + 100);
      expect(await stakingPool.startTime()).to.be.equal(startTime + 100);
    });

    it("Updates after end", async () => {
      const newStartTime = startTime + stakingPeriod + 100;
      await setNextBlockTimestamp(startTime + stakingPeriod + 1);
      await expect(stakingPool.setStartTime(newStartTime))
        .to.emit(stakingPool, "StartTimeSet")
        .withArgs(newStartTime);
      expect(await stakingPool.startTime()).to.be.equal(newStartTime);
    });
  });

  describe("Staking", () => {
    it("Pool should be open", async () => {
      await expect(stakingPool.connect(signers[1]).stake(1)).to.be.revertedWith("Stake: Pool is not open");
      await setNextBlockTimestamp(startTime + 1);
      await stakingPool.connect(signers[1]).stake(1);

      await setNextBlockTimestamp(startTime + stakingPeriod + 1);
      await expect(stakingPool.connect(signers[1]).stake(1)).to.be.revertedWith("Stake: Pool is not open");
    });

    it("Cannot stake zero amount", async () => {
      await setNextBlockTimestamp(startTime + 1);
      await expect(stakingPool.stake(0)).to.be.revertedWith("Stake: Cannot stake 0");
    });

    it("Staking amount increases", async () => {
      const stakeAmount1 = ethers.utils.parseUnits("10", 18);
      const stakeAmount2 = ethers.utils.parseUnits("4", 18);

      await setNextBlockTimestamp(startTime + 1);
      await stakingPool.connect(signers[1]).stake(stakeAmount1);

      // user info
      const stakeInfo1 = await stakingPool.stakeInfos(signers[1].address);
      expect(stakeInfo1.total).to.be.equal(stakeAmount1);

      // contract info
      const totalStaked1 = await stakingPool.totalStaked();
      expect(totalStaked1).to.be.equal(stakeAmount1);
      expect(await lpToken.balanceOf(stakingPool.address)).to.be.equal(totalStaked1);

      await stakingPool.connect(signers[1]).stake(stakeAmount2);

      // user info
      const stakeInfo2 = await stakingPool.stakeInfos(signers[1].address);
      expect(stakeInfo2.total).to.be.equal(stakeAmount1.add(stakeAmount2));

      // contract info
      const totalStaked2 = await stakingPool.totalStaked();
      expect(totalStaked2).to.be.equal(stakeAmount1.add(stakeAmount2));
      expect(await lpToken.balanceOf(stakingPool.address)).to.be.equal(totalStaked2);
    });
  });

  describe("RewardOf - rewards calculation", () => {
    it("Simple rewards calculation", async () => {
      const stakeTime = startTime + 1;
      await setNextBlockTimestamp(stakeTime);

      const stakeAmount = 1000;
      await stakingPool.connect(signers[1]).stake(stakeAmount);

      const period = stakingPeriod / 2;
      await setNextBlockTimestamp(stakeTime + period);
      await mineBlock();

      const rewards = await stakingPool.rewardsOf(signers[1].address);
      const expected = BigNumber.from(stakeAmount).mul(rewardAPY).div(100).mul(period).div(oneYear);
      expect(rewards).to.be.equal(expected);
    });

    it("Several stake amount updates", async () => {
      const stakeTime = startTime + 1;

      // first stake
      const stakeAmount1 = 1000;
      const stakeAmount2 = 3000;
      const stakeAmount3 = 11000;
      const period1 = stakingPeriod / 5;
      const period2 = stakingPeriod / 4;
      const period3 = stakingPeriod / 4;

      // first stake
      await setNextBlockTimestamp(stakeTime);
      await stakingPool.connect(signers[1]).stake(stakeAmount1);

      // second stake
      await setNextBlockTimestamp(stakeTime + period1);
      await stakingPool.connect(signers[1]).stake(stakeAmount2);

      const accumulated1 = BigNumber.from(stakeAmount1).mul(period1).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.mul(rewardAPY).div(100));

      // third stake
      await setNextBlockTimestamp(stakeTime + period1 + period2);
      await stakingPool.connect(signers[1]).stake(stakeAmount3);

      const accumulated2 = BigNumber.from(stakeAmount1 + stakeAmount2).mul(period2).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.add(accumulated2).mul(rewardAPY).div(100));

      await setNextBlockTimestamp(stakeTime + period1 + period2 + period3);
      await mineBlock();

      const accumulated3 = BigNumber.from(stakeAmount1 + stakeAmount2 + stakeAmount3).mul(period3).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.add(accumulated2).add(accumulated3).mul(rewardAPY).div(100));
    });

    it("APY effects the whole reward period", async () => {
      const stakeTime = startTime + 1;

      // first stake
      const stakeAmount1 = 1000;
      const stakeAmount2 = 3000;
      const stakeAmount3 = 11000;
      const period1 = stakingPeriod / 5;
      const period2 = stakingPeriod / 4;
      const period3 = stakingPeriod / 4;

      // first stake
      await setNextBlockTimestamp(stakeTime);
      await stakingPool.connect(signers[1]).stake(stakeAmount1);

      // second stake
      await setNextBlockTimestamp(stakeTime + period1);
      await stakingPool.connect(signers[1]).stake(stakeAmount2);

      const accumulated1 = BigNumber.from(stakeAmount1).mul(period1).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.mul(rewardAPY).div(100));

      // third stake
      await setNextBlockTimestamp(stakeTime + period1 + period2);
      await stakingPool.connect(signers[1]).stake(stakeAmount3);

      const accumulated2 = BigNumber.from(stakeAmount1 + stakeAmount2).mul(period2).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.add(accumulated2).mul(rewardAPY).div(100));

      await setNextBlockTimestamp(stakeTime + period1 + period2 + period3);
      await mineBlock();

      const accumulated3 = BigNumber.from(stakeAmount1 + stakeAmount2 + stakeAmount3).mul(period3).div(oneYear);
      expect(await stakingPool.rewardsOf(signers[1].address)).to.be.equal(accumulated1.add(accumulated2).add(accumulated3).mul(rewardAPY).div(100));
    });
  });
});
