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
      expect(tier0.apy.eq(APY_BASE.mul(4).div(100))).to.equal(true);
      expect(tier0.power).to.equal(POWER_BASE);
      expect(tier0.penalty).to.equal((PENALTY_BASE * 20) / 100);
      expect(tier0.lockPeriod).to.equal(60 * 24 * 3600);

      const tier1 = await singleStaking.tiers(1);
      expect(tier1.apy.eq(APY_BASE.mul(6).div(100))).to.equal(true);
      expect(tier1.power).to.equal((POWER_BASE * 130) / 100);
      expect(tier1.penalty).to.equal((PENALTY_BASE * 50) / 100);
      expect(tier1.lockPeriod).to.equal(365 * 24 * 3600);

      const tier2 = await singleStaking.tiers(2);
      expect(tier2.apy.eq(APY_BASE.mul(8).div(100))).to.equal(true);
      expect(tier2.power).to.equal((POWER_BASE * 142) / 100);
      expect(tier2.penalty).to.equal((PENALTY_BASE * 50) / 100);
      expect(tier2.lockPeriod).to.equal(365 * 24 * 3600 * 2);

      const tier3 = await singleStaking.tiers(3);
      expect(tier3.apy.eq(APY_BASE.mul(10).div(100))).to.equal(true);
      expect(tier3.power).to.equal((POWER_BASE * 200) / 100);
      expect(tier3.penalty).to.equal((PENALTY_BASE * 65) / 100);
      expect(tier3.lockPeriod).to.equal(365 * 24 * 3600 * 3);
    });
  });

  describe("Stake", async () => {
    it("tier0 stake", async () => {
      expect(await singleStaking.currentStakeId()).to.equal(0);

      await singleStaking
        .connect(staker1)
        .stake(ethers.utils.parseEther("100"), 0);

      expect(await singleStaking.currentStakeId()).to.equal(1);
      const stakeInfo = await singleStaking.userStakeOf(0);
      expect(stakeInfo.account).to.equal(staker1.address);
      expect(stakeInfo.amount).to.equal(ethers.utils.parseEther("100"));
      expect(stakeInfo.unstakedAt).to.equal(ethers.utils.parseEther("0"));
      expect(stakeInfo.tierIndex).to.equal(0);
    });

    it("tier1 stake", async () => {
      await singleStaking
        .connect(staker1)
        .stake(ethers.utils.parseEther("100"), 1);

      expect(await singleStaking.currentStakeId()).to.equal(2);
      const stakeInfo = await singleStaking.userStakeOf(1);
      expect(stakeInfo.account).to.equal(staker1.address);
      expect(stakeInfo.amount).to.equal(ethers.utils.parseEther("100"));
      expect(stakeInfo.unstakedAt).to.equal(ethers.utils.parseEther("0"));
      expect(stakeInfo.tierIndex).to.equal(1);
    });
  });

  describe("Unstake", async () => {
    it("should be failed in lockedPeriod", async () => {
      await expect(
        singleStaking.connect(staker1).unstake(0)
      ).to.be.revertedWith("Invalid lock period");
    });

    it("should be success", async () => {
      await advanceTime(ONE_DAY * 60);
      await singleStaking.connect(staker1).unstake(0);

      const stakeInfo = await singleStaking.userStakeOf(0);
      expect(stakeInfo.unstakedAt).to.not.equal(ethers.utils.parseEther("0"));
    });
  });

  describe("EmergencyWithdraw", async () => {
    it("should be success", async () => {
      await singleStaking.connect(staker1).emergencyWithdraw(1);

      const stakeInfo = await singleStaking.userStakeOf(1);
      expect(stakeInfo.unstakedAt).to.not.equal(ethers.utils.parseEther("0"));
    });
  });
});
