/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { CustomToken, FlamePool } from "../typechain";
import { advanceTime, duration, getBigNumber } from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe("Flame Staking Pool", () => {
  const totalSupply = getBigNumber("100000000");
  const totalAmount = getBigNumber("20000000");
  const totalRewardAmount = getBigNumber("2500000");

  // to avoid complex calculation of decimals, we set an easy value
  const rewardPerSecond = BigNumber.from("100000000000000000");

  let staking: FlamePool;
  let flameToken: CustomToken;
  let rewardToken: CustomToken;

  let deployer: SignerWithAddress;
  let bob: SignerWithAddress;
  let alice: SignerWithAddress;

  before(async () => {
    [deployer, bob, alice] = await ethers.getSigners();
  });

  beforeEach(async () => {
    flameToken = <CustomToken>(
      await deployContract("CustomToken", "Flame Token", "FLAME", totalSupply)
    );
    rewardToken = <CustomToken>(
      await deployContract("CustomToken", "Reward token", "REWARD", totalSupply)
    );
    staking = <FlamePool>(
      await deployProxy(
        "FlamePool",
        flameToken.address,
        rewardToken.address,
        rewardPerSecond
      )
    );

    await rewardToken.transfer(staking.address, totalRewardAmount);
    await rewardToken.approve(staking.address, ethers.constants.MaxUint256);

    await flameToken.transfer(bob.address, totalAmount.div(5));
    await flameToken.transfer(alice.address, totalAmount.div(5));

    await flameToken.approve(staking.address, ethers.constants.MaxUint256);
    await flameToken
      .connect(bob)
      .approve(staking.address, ethers.constants.MaxUint256);
    await flameToken
      .connect(alice)
      .approve(staking.address, ethers.constants.MaxUint256);
  });

  describe("initialize", async () => {
    it("Validiation of initilize params", async () => {
      await expect(
        deployProxy(
          "FlamePool",
          flameToken.address,
          ethers.constants.AddressZero,
          rewardPerSecond
        )
      ).to.be.revertedWith("Invalid token address");
      await expect(
        deployProxy(
          "FlamePool",
          ethers.constants.AddressZero,
          rewardToken.address,
          rewardPerSecond
        )
      ).to.be.revertedWith("Invalid token address");
    });
  });

  describe("Deposit", () => {
    it("Depositing 0 amount", async () => {
      await expect(staking.deposit(getBigNumber(0), bob.address))
        .to.emit(staking, "Deposit")
        .withArgs(deployer.address, 0, bob.address);
    });

    it("Staking amount increases", async () => {
      const stakeAmount1 = ethers.utils.parseUnits("10", 18);
      const stakeAmount2 = ethers.utils.parseUnits("4", 18);

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

  describe("Withdraw", () => {
    it("Withdraw 0 amount", async () => {
      await expect(staking.withdraw(getBigNumber(0), bob.address))
        .to.emit(staking, "Withdraw")
        .withArgs(deployer.address, 0, bob.address);
    });
  });

  describe("Harvest", () => {
    it("Should give back the correct amount of FLAME and REWARD", async () => {
      const period = duration.days(31).toNumber();
      const expectedReward = rewardPerSecond.mul(period);

      await staking.deposit(getBigNumber(1), alice.address);
      await advanceTime(period);
      await staking.connect(alice).harvest(alice.address);

      expect(await rewardToken.balanceOf(alice.address)).to.be.equal(
        expectedReward
      );
      expect((await staking.userInfo(alice.address)).rewardDebt).to.be.equal(
        expectedReward
      );
      expect(await staking.pendingReward(alice.address)).to.be.equal(0);
    });
  });
});
