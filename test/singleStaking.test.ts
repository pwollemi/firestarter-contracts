import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { CustomToken, SingleStaking } from "../typechain";
import {
  setNextBlockTimestamp,
  getLatestBlockTimestamp,
  mineBlock,
  advanceTime,
} from "../helper/utils";
import { deployContract } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

const ONE_DAY = 3600 * 24;
const lockAmount = ethers.utils.parseEther("100");

describe("SingleStaking", () => {
  const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);
  const APY_BASE = ethers.utils.parseEther("1");
  const POWER_BASE = 100;
  const PENALTY_BASE = 100;

  let signers: SignerWithAddress[];
  let staker1: SignerWithAddress;
  let customToken: CustomToken;
  let singleStaking: SingleStaking;

  before(async () => {
    signers = await ethers.getSigners();
    staker1 = signers[1];
    customToken = <CustomToken>(
      await deployContract("CustomToken", "Token", "Token", totalTokenSupply)
    );
    singleStaking = <SingleStaking>await deployContract("SingleStaking");
    await customToken.transfer(
      staker1.address,
      ethers.utils.parseEther("100000")
    );
    await customToken
      .connect(staker1)
      .approve(singleStaking.address, ethers.utils.parseEther("100000"));
  });

  //   beforeEach(async () => {});

  describe("Initialize", async () => {
    before(async () => {
      await singleStaking.initialize(customToken.address);
    });

    it("tierInfo", async () => {
      const tier0 = await singleStaking.tiers(0);
      expect(tier0.apy.isZero()).to.equal(true);
      expect(tier0.power).to.equal(POWER_BASE);
      expect(tier0.penalty).to.equal((PENALTY_BASE * 50) / 100);
      expect(tier0.lockPeriod).to.equal(30 * 24 * 3600);
    });
  });

  describe("Stake", async () => {
    it("tier0 stake", async () => {
      expect(await singleStaking.currentStakeId()).to.equal(0);

      await singleStaking.connect(staker1).stake(lockAmount, 0);

      expect(await singleStaking.currentStakeId()).to.equal(1);
      const stakeInfo = await singleStaking.userStakeOf(0);
      expect(stakeInfo.account).to.equal(staker1.address);
      expect(stakeInfo.amount).to.equal(lockAmount);
      expect(stakeInfo.unstakedAt).to.equal(ethers.utils.parseEther("0"));
      expect(stakeInfo.tierIndex).to.equal(0);
    });

    it("tier1 stake", async () => {
      await singleStaking.connect(staker1).stake(lockAmount, 1);

      expect(await singleStaking.currentStakeId()).to.equal(2);
      const stakeInfo = await singleStaking.userStakeOf(1);
      expect(stakeInfo.account).to.equal(staker1.address);
      expect(stakeInfo.amount).to.equal(lockAmount);
      expect(stakeInfo.unstakedAt).to.equal(ethers.utils.parseEther("0"));
      expect(stakeInfo.tierIndex).to.equal(1);
    });

    it("tier2 stake", async () => {
      await singleStaking.connect(staker1).stake(lockAmount, 2);

      expect(await singleStaking.currentStakeId()).to.equal(3);
      const stakeInfo = await singleStaking.userStakeOf(2);
      expect(stakeInfo.account).to.equal(staker1.address);
      expect(stakeInfo.amount).to.equal(lockAmount);
      expect(stakeInfo.unstakedAt).to.equal(ethers.utils.parseEther("0"));
      expect(stakeInfo.tierIndex).to.equal(2);
    });
  });

  describe("Unstake tier0", async () => {
    it("should be failed in lockedPeriod", async () => {
      await expect(
        singleStaking.connect(staker1).unstake(0)
      ).to.be.revertedWith("Invalid lock period");
    });

    it("should be success", async () => {
      await advanceTime(ONE_DAY * 30);
      const preBal = await customToken.balanceOf(staker1.address);
      await singleStaking.connect(staker1).unstake(0);
      const postBal = await customToken.balanceOf(staker1.address);

      const stakeInfo = await singleStaking.userStakeOf(0);
      expect(stakeInfo.unstakedAt).to.not.equal(ethers.utils.parseEther("0"));
      expect(postBal.sub(preBal)).to.equal(lockAmount); // no apy

      await expect(
        singleStaking.connect(staker1).unstake(0)
      ).to.be.revertedWith("Invalid unstakedAt");
    });
  });

  describe("unstakeEarly tier1", async () => {
    it("should be success", async () => {
      const preBal = await customToken.balanceOf(staker1.address);
      await singleStaking.connect(staker1).unstakeEarly(1);
      const postBal = await customToken.balanceOf(staker1.address);

      const stakeInfo = await singleStaking.userStakeOf(1);
      expect(stakeInfo.unstakedAt).to.not.equal(ethers.utils.parseEther("0"));
      expect(postBal.sub(preBal)).to.equal(lockAmount.mul(60).div(100)); // 40% penalty

      await expect(
        singleStaking.connect(staker1).unstake(1)
      ).to.be.revertedWith("Invalid unstakedAt");
    });
  });

  describe("Unstake tier2", async () => {
    it("should be success", async () => {
      await advanceTime(ONE_DAY * 365);
      const preBal = await customToken.balanceOf(staker1.address);
      await singleStaking.connect(staker1).unstake(2);
      const postBal = await customToken.balanceOf(staker1.address);

      const stakeInfo = await singleStaking.userStakeOf(2);
      expect(stakeInfo.unstakedAt).to.not.equal(ethers.utils.parseEther("0"));
      expect(postBal.sub(preBal)).to.equal(lockAmount.mul(115).div(100)); // 15% apy
    });
  });

  describe("Linear penalty", async () => {
    it("should be success", async () => {
      await singleStaking.connect(staker1).stake(lockAmount, 3);

      expect(await singleStaking.getPenaltyAmount(3)).to.equal(lockAmount); // 100%

      await advanceTime(ONE_DAY * 90);
      await mineBlock();
      expect(await singleStaking.getPenaltyAmount(3)).to.equal(
        lockAmount.mul(30).div(100)
      ); // 30%

      await advanceTime(ONE_DAY * 90);
      await mineBlock();
      expect(await singleStaking.getPenaltyAmount(3)).to.equal(
        lockAmount.mul(28).div(100)
      ); // total = 33, current = 3, 30% - 30% * 3 / 33 = 28%
    });
  });
});
