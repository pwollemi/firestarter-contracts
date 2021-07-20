/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { CustomToken, Vesting } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe('Vesting', () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);
  const vestingParams = {
    vestingName: "Marketing",
    amountToBeVested: totalAmount,
    initalUnlock: 2000000000, // 20%
    withdrawInterval: 60, // 1 min
    releaseRate: 372000, // release 10% every interval
    lockPeriod: 86400 * 7 * 2 // 2 weeks
  }

  let vesting: Vesting;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    vesting = <Vesting>await deployProxy("Vesting", flameToken.address, vestingParams);

    await flameToken.transfer(vesting.address, totalAmount);
  });

  describe("init", async () => {
    it("Only owner can call this function", async () => {
      await expect(vesting.connect(signers[2]).init(signers[1].address)).to.be.revertedWith("Requires Owner Role");
      await vesting.connect(signers[0]).init(signers[1].address);
    });

    it("Init updates the owner", async () => {
      await vesting.connect(signers[0]).init(signers[1].address);
      expect(await vesting.owner()).to.be.equal(signers[1].address);
      await vesting.connect(signers[1]).init(signers[2].address);
    });
  });

  describe("updateRecipient", async () => {
    it("Only owner can call this function", async () => {
      await expect(vesting.connect(signers[2]).updateRecipient(signers[1].address, "1")).to.be.revertedWith("Requires Owner Role");
      await vesting.connect(signers[0]).updateRecipient(signers[1].address, "1");
    });

    it("Cannot vest 0", async () => {
      await expect(vesting.updateRecipient(signers[1].address, "0")).to.be.revertedWith("updateRecipient: Cannot vest 0");
    });

    it("Cannot update the recipient after started", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      await vesting.setStartTime(startTime);
      await setNextBlockTimestamp(startTime + 10);
      await expect(vesting.updateRecipient(signers[1].address, "1")).to.be.revertedWith("updateRecipient: Cannot update the receipient after started");
    });

    it("Cannot set more than total amount", async () => {
      await expect(vesting.updateRecipient(signers[1].address, totalAmount.add(1))).to.be.revertedWith("updateRecipient: Vesting amount exceeds current balance");
    });

    it("Recipient amount is updated.", async () => {
      const amount = totalAmount.div(5);
      await vesting.updateRecipient(signers[1].address, amount);
      const recpData = await vesting.recipients(signers[1].address);
      expect(recpData.totalAmount).to.be.equal(amount);
    });

    it("VestingInfoUpdated event is emitted.", async () => {
      const amount = totalAmount.div(5);
      await expect(vesting.updateRecipient(signers[1].address, amount))
        .to.emit(vesting, "VestingInfoUpdated")
        .withArgs(signers[1].address, amount);
    });
  });

  describe("setStartTime", async () => {
    it("Cannot set if alredy started", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      await vesting.setStartTime(startTime);
      await setNextBlockTimestamp(startTime + 10);
      await expect(vesting.setStartTime(startTime)).to.be.revertedWith("setStartTime: Already started");
    });

    it("Must set future time", async () => {
      const startTime = await getLatestBlockTimestamp();
      await expect(vesting.setStartTime(startTime)).to.be.revertedWith("setStartTime: Should be time in future");
    });

    it("Time is set/event emitted", async () => {
      const startTime = await getLatestBlockTimestamp() + 100;
      await expect(vesting.setStartTime(startTime))
        .to.emit(vesting, "StartTimeSet")
        .withArgs(startTime);
      expect(await vesting.startTime()).to.be.equal(startTime);
    });
  });

  describe("vested", () => {
    it("Should be zero if not started", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      const amount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, amount);
      expect(await vesting.vested(signers[1].address)).to.be.equal(0);
    });

    it("Should be zero if in lockPeriod", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      const amount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, amount);
      await setNextBlockTimestamp(startTime + vestingParams.lockPeriod - 1);
      expect(await vesting.vested(signers[1].address)).to.be.equal(0);
    });

    it("Correct amount should be vested", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const initalUnlockAmoumnt = vestingAmount.mul(vestingParams.initalUnlock).div(1e10);
      const releaseAmount = vestingAmount.mul(vestingParams.releaseRate).div(1e10);
      for (let i = 10; ; i += vestingParams.withdrawInterval * 1000) {
        await setNextBlockTimestamp(startTime + vestingParams.lockPeriod + i);
        await mineBlock();
        const vestedAmount = releaseAmount.mul(Math.floor(i / vestingParams.withdrawInterval)).add(initalUnlockAmoumnt);
        if (vestedAmount.gt(vestingAmount)) {
          expect(await vesting.vested(signers[1].address)).to.be.equal(vestingAmount);
          break;
        }
        expect(await vesting.vested(signers[1].address)).to.be.equal(vestedAmount);
      }
    });
  });
  
  describe("withdraw", () => {
    it("Correct amount is withdrawn/event is emitted", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const passedTime = vestingParams.withdrawInterval * 10000 + 1;
      const initalUnlockAmoumnt = vestingAmount.mul(vestingParams.initalUnlock).div(1e10);
      const releaseAmount = vestingAmount.mul(vestingParams.releaseRate).div(1e10);
      const vestedAmount = releaseAmount.mul(Math.floor(passedTime / vestingParams.withdrawInterval)).add(initalUnlockAmoumnt);

      await setNextBlockTimestamp(startTime + vestingParams.lockPeriod + passedTime);

      const balance0 = await flameToken.balanceOf(signers[1].address);
      await expect(vesting.connect(signers[1]).withdraw())
        .to.emit(vesting, "Withdraw")
        .withArgs(signers[1].address, vestedAmount);
      const balance1 = await flameToken.balanceOf(signers[1].address);

      expect(vestedAmount).to.be.equal(balance1.sub(balance0));
    });

    it("withdrawable amound decrease / amountWithdrawn is updated", async () => {
      const startTime = await getLatestBlockTimestamp() + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const passedTime = vestingParams.withdrawInterval * 10000 + 1;
      const initalUnlockAmoumnt = vestingAmount.mul(vestingParams.initalUnlock).div(1e10);
      const releaseAmount = vestingAmount.mul(vestingParams.releaseRate).div(1e10);
      const vestedAmount = releaseAmount.mul(Math.floor(passedTime / vestingParams.withdrawInterval)).add(initalUnlockAmoumnt);

      await setNextBlockTimestamp(startTime + vestingParams.lockPeriod + passedTime);
      await vesting.connect(signers[1]).withdraw();

      expect(await vesting.withdrawable(signers[1].address)).to.be.equal(0);
      const recpInfo = await vesting.recipients(signers[1].address);
      expect(recpInfo.amountWithdrawn).to.be.equal(vestedAmount);
    });
  });
});
