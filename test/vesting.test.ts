/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { CustomToken, Vesting } from "../typechain";
import {
  setNextBlockTimestamp,
  getLatestBlockTimestamp,
  mineBlock,
} from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe("Vesting", () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);
  const vestingParams = {
    vestingName: "Marketing",
    amountToBeVested: totalAmount,
    initialUnlock: 1000000000, // 10%
    releaseInterval: 60, // 1 min
    releaseRate: 23150, // release 10% every month
    lockPeriod: 60, // 1min
    vestingPeriod: 86400 * 30 * 8, // 8 month
  };

  let vesting: Vesting;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];

  const workerIndex = 1;

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    flameToken = <CustomToken>(
      await deployContract("CustomToken", "Flame token", "FLAME", totalSupply)
    );
    vesting = <Vesting>(
      await deployProxy("Vesting", flameToken.address, vestingParams)
    );

    await vesting.setWorker(signers[workerIndex].address);

    await flameToken.transfer(vesting.address, totalAmount);
  });

  describe("initialize", async () => {
    it("Validiation of initilize params", async () => {
      const params = {
        vestingName: "Marketing",
        amountToBeVested: totalAmount,
        initialUnlock: 1000000000, // 10%
        releaseInterval: 60, // 1 min
        releaseRate: 23150, // release 10% every month
        lockPeriod: 60, // 1min
        vestingPeriod: 86400 * 30 * 8, // 8 month
      };
      await expect(
        deployProxy("Vesting", ethers.constants.AddressZero, params)
      ).to.be.revertedWith("initialize: rewardToken cannot be zero");
      await expect(
        deployProxy("Vesting", flameToken.address, {
          ...params,
          releaseRate: 0,
        })
      ).to.be.revertedWith("initialize: release rate cannot be zero");
      await expect(
        deployProxy("Vesting", flameToken.address, {
          ...params,
          releaseInterval: 0,
        })
      ).to.be.revertedWith("initialize: release interval cannot be zero");
    });
  });

  describe("init", async () => {
    it("Only owner can call this function", async () => {
      await expect(
        vesting.connect(signers[2]).init(signers[1].address)
      ).to.be.revertedWith("Requires Owner Role");
      await vesting.connect(signers[0]).init(signers[1].address);
    });

    it("Cannot set zero address", async () => {
      await expect(
        vesting.connect(signers[0]).init(ethers.constants.AddressZero)
      ).to.be.revertedWith("init: owner cannot be zero");
    });

    it("Init updates the owner", async () => {
      await vesting.connect(signers[0]).init(signers[1].address);
      expect(await vesting.owner()).to.be.equal(signers[1].address);
      await vesting.connect(signers[1]).init(signers[2].address);
    });
  });

  describe("updateRecipient", async () => {
    it("Only owner or worker can call this function", async () => {
      await expect(
        vesting.connect(signers[2]).updateRecipient(signers[1].address, "1")
      ).to.be.revertedWith("Vesting: caller is not the owner nor the worker");
      await expect(
        vesting.connect(signers[3]).updateRecipient(signers[1].address, "1")
      ).to.be.revertedWith("Vesting: caller is not the owner nor the worker");
      await vesting
        .connect(signers[0])
        .updateRecipient(signers[1].address, "1");
      await vesting
        .connect(signers[workerIndex])
        .updateRecipient(signers[2].address, "2");
    });

    it("Cannot vest 0", async () => {
      await expect(
        vesting.updateRecipient(signers[1].address, "0")
      ).to.be.revertedWith("updateRecipient: Cannot vest 0");
    });

    it("Cannot update the recipient after started", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);
      await setNextBlockTimestamp(startTime + 10);
      await expect(
        vesting.updateRecipient(signers[1].address, "1")
      ).to.be.revertedWith(
        "updateRecipient: Cannot update the receipient after started"
      );
    });

    it("Cannot set more than total amount", async () => {
      await expect(
        vesting.updateRecipient(signers[1].address, totalAmount.add(1))
      ).to.be.revertedWith(
        "updateRecipient: Vesting amount exceeds current balance"
      );
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
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);
      await setNextBlockTimestamp(startTime + 10);
      await expect(vesting.setStartTime(startTime)).to.be.revertedWith(
        "setStartTime: Already started"
      );
    });

    it("Must set future time", async () => {
      const startTime = await getLatestBlockTimestamp();
      await expect(vesting.setStartTime(startTime)).to.be.revertedWith(
        "setStartTime: Should be time in future"
      );
    });

    it("Time is set/event emitted", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 100;
      await expect(vesting.setStartTime(startTime))
        .to.emit(vesting, "StartTimeSet")
        .withArgs(startTime);
      expect(await vesting.startTime()).to.be.equal(startTime);
    });
  });

  describe("vested", () => {
    it("Should be zero if not started", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const amount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, amount);
      expect(await vesting.vested(signers[1].address)).to.be.equal(0);
    });

    it("Should be zero if in lockPeriod", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const amount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, amount);
      await setNextBlockTimestamp(startTime + vestingParams.lockPeriod - 1);
      expect(await vesting.vested(signers[1].address)).to.be.equal(0);
    });

    it("Should only release every interval", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;

      const amount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, amount);

      const initialUnlockAmoumnt = amount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      const releaseAmount = amount.mul(vestingParams.releaseRate).div(1e10);

      await setNextBlockTimestamp(lockEndTime + 1);
      await mineBlock();
      expect(await vesting.vested(signers[1].address)).to.be.equal(
        initialUnlockAmoumnt
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval - 1
      );
      await mineBlock();
      expect(await vesting.vested(signers[1].address)).to.be.equal(
        initialUnlockAmoumnt
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 2 - 1
      );
      await mineBlock();
      expect(await vesting.vested(signers[1].address)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount)
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 3 - 1
      );
      await mineBlock();
      expect(await vesting.vested(signers[1].address)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount.mul(2))
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 4 - 1
      );
      await mineBlock();
      expect(await vesting.vested(signers[1].address)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount.mul(3))
      );
    });

    it("Correct amount should be vested during the lockPeriod", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;
      const vestingEndTime = lockEndTime + vestingParams.vestingPeriod;

      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const initialUnlockAmoumnt = vestingAmount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      for (let i = 10; ; i += vestingParams.releaseInterval * 1000) {
        const nextTime = lockEndTime + i;
        await setNextBlockTimestamp(nextTime);
        await mineBlock();
        const vestedAmount = BigNumber.from(i)
          .div(vestingParams.releaseInterval)
          .mul(vestingAmount)
          .mul(vestingParams.releaseRate)
          .div(1e10)
          .add(initialUnlockAmoumnt);
        if (vestedAmount.gt(vestingAmount) || nextTime > vestingEndTime) {
          expect(await vesting.vested(signers[1].address)).to.be.equal(
            vestingAmount
          );
          break;
        }
        const locked = await vesting.locked(signers[1].address);
        expect(await vesting.vested(signers[1].address))
          .to.be.equal(vestedAmount)
          .to.be.equal(vestingAmount.sub(locked));
      }
    });

    it("Full amount should be released after vesting period", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;
      const vestingEndTime = lockEndTime + vestingParams.vestingPeriod;

      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);
      await setNextBlockTimestamp(vestingEndTime + 1);
      await mineBlock();

      expect(await vesting.vested(signers[1].address)).to.be.equal(
        vestingAmount
      );
    });
  });

  describe("withdraw", () => {
    it("If zero, nothing happens", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);

      const passedTime = vestingParams.releaseInterval * 10000 + 1;
      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );

      const balance0 = await flameToken.balanceOf(signers[1].address);
      const receipt = await (
        await vesting.connect(signers[1]).withdraw()
      ).wait();
      expect(receipt.events?.length).to.be.equal(0);
      const balance1 = await flameToken.balanceOf(signers[1].address);
      expect(balance0).to.be.equal(balance1);
    });

    it("Correct amount is withdrawn/event is emitted", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const passedTime = vestingParams.releaseInterval * 10000 + 1;
      const initialUnlockAmoumnt = vestingAmount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      const vestedAmount = BigNumber.from(passedTime)
        .div(vestingParams.releaseInterval)
        .mul(vestingAmount)
        .mul(vestingParams.releaseRate)
        .div(1e10)
        .add(initialUnlockAmoumnt);

      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );

      const balance0 = await flameToken.balanceOf(signers[1].address);
      await expect(vesting.connect(signers[1]).withdraw())
        .to.emit(vesting, "Withdraw")
        .withArgs(signers[1].address, vestedAmount);
      const balance1 = await flameToken.balanceOf(signers[1].address);

      expect(vestedAmount).to.be.equal(balance1.sub(balance0));
    });

    it("withdrawable amound decrease / amountWithdrawn is updated", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const passedTime = vestingParams.releaseInterval * 10000 + 1;
      const initialUnlockAmoumnt = vestingAmount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      const vestedAmount = BigNumber.from(passedTime)
        .div(vestingParams.releaseInterval)
        .mul(vestingAmount)
        .mul(vestingParams.releaseRate)
        .div(1e10)
        .add(initialUnlockAmoumnt);

      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );
      await vesting.connect(signers[1]).withdraw();

      expect(await vesting.withdrawable(signers[1].address)).to.be.equal(0);
      const recpInfo = await vesting.recipients(signers[1].address);
      expect(recpInfo.amountWithdrawn).to.be.equal(vestedAmount);
    });

    it("withdrawable amound decrease / amountWithdrawn is updated", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      // calculate time to withdraw all
      const ACCURACY = await vesting.ACCURACY();
      const passedTime =
        vestingParams.releaseInterval *
        (ACCURACY.div(vestingParams.releaseRate).toNumber() + 1);
      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );
      await vesting.connect(signers[1]).withdraw();

      // if no withdrawable amount, then reverts
      await expect(vesting.connect(signers[1]).withdraw()).to.be.revertedWith(
        "Nothing to withdraw"
      );
    });
  });

  describe("refund", () => {
    it("Only Owner/Caller can do it", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      await expect(
        vesting.connect(signers[2]).refundRecipient(signers[1].address)
      ).to.be.revertedWith("Vesting: caller is not the owner nor the worker");
    });

    it("No tokens vesting", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);

      await expect(
        vesting.refundRecipient(signers[1].address)
      ).to.be.revertedWith("No tokens vesting");
    });

    it("Can't refund if already withdrawn", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      const passedTime = vestingParams.releaseInterval * 10000 + 1;
      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );
      await vesting.connect(signers[1]).withdraw();

      await expect(
        vesting.refundRecipient(signers[1].address)
      ).to.be.revertedWith("Already withdrawn");
    });

    it("Correct amount is refunded/event is emitted", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[1].address, vestingAmount);

      await expect(vesting.refundRecipient(signers[1].address))
        .to.emit(vesting, "Refunded")
        .withArgs(signers[1].address, vestingAmount);

      const vestingInfo = await vesting.recipients(signers[1].address);
      expect(vestingInfo.totalAmount).to.be.equal(0);
    });
  });

  describe("set/remove Worker", () => {
    it("setWorker", async () => {
      await expect(
        vesting.connect(signers[2]).setWorker(signers[2].address)
      ).to.be.revertedWith("Requires Owner Role");
      await expect(
        vesting.connect(signers[3]).setWorker(signers[2].address)
      ).to.be.revertedWith("Requires Owner Role");
      await expect(
        vesting.connect(signers[4]).setWorker(signers[2].address)
      ).to.be.revertedWith("Requires Owner Role");

      await vesting.setWorker(signers[2].address);
      expect(await vesting.worker()).to.be.equal(signers[2].address);
    });

    it("removeWorker", async () => {
      await expect(
        vesting.connect(signers[2]).removeWorker()
      ).to.be.revertedWith("Requires Owner Role");
      await expect(
        vesting.connect(signers[3]).removeWorker()
      ).to.be.revertedWith("Requires Owner Role");
      await expect(
        vesting.connect(signers[4]).removeWorker()
      ).to.be.revertedWith("Requires Owner Role");

      await vesting.removeWorker();
      expect(await vesting.worker()).to.be.equal(ethers.constants.AddressZero);
    });
  });

  describe("analysis support", () => {
    it("participants list", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[0].address, 1);
      await vesting.updateRecipient(signers[1].address, 1);
      await vesting.updateRecipient(signers[2].address, 1);
      await vesting.updateRecipient(signers[3].address, 1);
      await vesting.updateRecipient(signers[0].address, 1);
      await vesting.updateRecipient(signers[3].address, 1);
      await vesting.updateRecipient(signers[4].address, 1);
      await vesting.updateRecipient(signers[5].address, 1);

      const participants = await vesting.getParticipants(0, 6);
      expect(await vesting.participantCount()).to.be.equal(6);
      expect(participants.length).to.be.equal(6);
      expect(participants).to.be.eql([
        signers[0].address,
        signers[1].address,
        signers[2].address,
        signers[3].address,
        signers[4].address,
        signers[5].address,
      ]);
    });

    it("pagination", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      await vesting.setStartTime(startTime);
      await vesting.updateRecipient(signers[0].address, 1);
      await vesting.updateRecipient(signers[1].address, 1);
      await vesting.updateRecipient(signers[2].address, 1);
      await vesting.updateRecipient(signers[3].address, 1);
      await vesting.updateRecipient(signers[4].address, 1);
      await vesting.updateRecipient(signers[5].address, 1);

      expect(await vesting.getParticipants(1, 3)).to.be.eql([
        signers[3].address,
        signers[4].address,
        signers[5].address,
      ]);
      expect(await vesting.getParticipants(1, 4)).to.be.eql([
        signers[4].address,
        signers[5].address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
      ]);
    });
  });
});
