/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import {
  CustomToken,
  FirestarterSft,
  FirestarterSftVesting,
} from "../typechain";
import {
  setNextBlockTimestamp,
  getLatestBlockTimestamp,
  mineBlock,
} from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe("FirestarterSftVesting", () => {
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

  let sft: FirestarterSft;
  let vesting: FirestarterSftVesting;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let worker: SignerWithAddress;
  let sftCollector: SignerWithAddress;
  let sftId: number;

  const workerIndex = 1;

  before(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
    worker = signers[1];
    sftCollector = signers[2];
    sftId = 0;
  });

  beforeEach(async () => {
    flameToken = <CustomToken>(
      await deployContract("CustomToken", "Flame token", "FLAME", totalSupply)
    );

    sft = <FirestarterSft>await deployContract("FirestarterSFT");

    vesting = <FirestarterSftVesting>(
      await deployContract("FirestarterSFTVesting")
    );

    await sft.initialize(
      "FirestarterSft",
      "FSFT",
      deployer.address,
      vesting.address,
      totalAmount.div(10000),
      ethers.utils.parseUnits("10000", 18)
    );

    await vesting.initialize(flameToken.address, sft.address, vestingParams);

    await vesting.setWorker(worker.address);

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
        vesting.connect(signers[2]).init(sftCollector.address)
      ).to.be.revertedWith("Requires Owner Role");
      await vesting.connect(signers[0]).init(sftCollector.address);
    });

    it("Cannot set zero address", async () => {
      await expect(
        vesting.connect(signers[0]).init(ethers.constants.AddressZero)
      ).to.be.revertedWith("init: owner cannot be zero");
    });
  });

  describe("Mint SFT", async () => {
    it("Only minter can mint SFTs", async () => {
      await expect(
        sft.connect(worker).mint(sftCollector.address, 0, false)
      ).to.be.revertedWith("Not Minter!");
    });

    it("Mint SFT", async () => {
      await sft.mint(sftCollector.address, 0, false);
    });
  });

  describe("Update Recipient mints new SFT", async () => {
    it("Only worker can update recipient", async () => {
      await expect(
        vesting
          .connect(sftCollector)
          .updateRecipient(
            sftCollector.address,
            ethers.utils.parseUnits("1", 18)
          )
      ).to.be.revertedWith("Vesting: caller is not the owner nor the worker");
    });

    it("Update Recipient mints a new SFT", async () => {
      const amount = ethers.utils.parseUnits("100", 18);

      await sft.setMinter(vesting.address);
      const balance0 = await sft.balanceOf(sftCollector.address);
      const tokenId = await sft.nextTokenId();
      await vesting
        .connect(worker)
        .updateRecipient(sftCollector.address, amount);
      const balance1 = await sft.balanceOf(sftCollector.address);

      const tokenInfo = await sft.getVestingInfo(tokenId);
      expect(balance1.sub(balance0)).to.be.equal(1);
      expect(await sft.ownerOf(tokenId)).to.be.equal(sftCollector.address);
      expect(tokenInfo.totalAmount).to.be.equal(amount);
      expect(tokenInfo.unset).to.be.equal(false);
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
    it("Should only release every interval", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;

      const amount = totalAmount.div(10);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, 0, false);

      const initialUnlockAmoumnt = amount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      const releaseAmount = amount.mul(vestingParams.releaseRate).div(1e10);

      await setNextBlockTimestamp(lockEndTime + 1);
      await mineBlock();
      expect(await vesting.vested(sftId)).to.be.equal(initialUnlockAmoumnt);

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval - 1
      );
      await mineBlock();
      expect(await vesting.vested(sftId)).to.be.equal(initialUnlockAmoumnt);

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 2 - 1
      );
      await mineBlock();
      expect(await vesting.vested(sftId)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount)
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 3 - 1
      );
      await mineBlock();
      expect(await vesting.vested(sftId)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount.mul(2))
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval * 4 - 1
      );
      await mineBlock();
      expect(await vesting.vested(sftId)).to.be.equal(
        initialUnlockAmoumnt.add(releaseAmount.mul(3))
      );
    });

    it("Correct amount should be vested during the lockPeriod", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;
      const vestingEndTime = lockEndTime + vestingParams.vestingPeriod;

      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, vestingAmount, false);

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
          expect(await vesting.vested(sftId)).to.be.equal(vestingAmount);
          break;
        }
        const locked = await vesting.locked(sftId);
        expect(await vesting.vested(sftId))
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
      await sft.mint(sftCollector.address, vestingAmount, false);
      await setNextBlockTimestamp(vestingEndTime + 1);
      await mineBlock();

      expect(await vesting.vested(sftId)).to.be.equal(vestingAmount);
    });
  });

  describe("withdraw", () => {
    it("Correct amount is withdrawn/event is emitted", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, vestingAmount, false);

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

      const balance0 = await flameToken.balanceOf(sftCollector.address);
      await expect(vesting.connect(sftCollector).withdraw(sftId))
        .to.emit(vesting, "Withdraw")
        .withArgs(sftCollector.address, vestedAmount);
      const balance1 = await flameToken.balanceOf(sftCollector.address);

      expect(vestedAmount).to.be.equal(balance1.sub(balance0));
    });

    it("withdrawable amound decrease / amountWithdrawn is updated", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, vestingAmount, false);

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
      await vesting.connect(sftCollector).withdraw(sftId);

      expect(await vesting.withdrawable(sftCollector.address)).to.be.equal(0);
      const recpInfo = await sft.getVestingInfo(sftId);
      expect(recpInfo.amountWithdrawn).to.be.equal(vestedAmount);
    });

    it("withdrawable amound decrease / amountWithdrawn is updated", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const vestingAmount = totalAmount.div(5);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, vestingAmount, false);

      // calculate time to withdraw all
      const ACCURACY = await vesting.ACCURACY();
      const passedTime =
        vestingParams.releaseInterval *
        (ACCURACY.div(vestingParams.releaseRate).toNumber() + 1);
      await setNextBlockTimestamp(
        startTime + vestingParams.lockPeriod + passedTime
      );
      await vesting.connect(sftCollector).withdraw(sftId);

      // if no withdrawable amount, then reverts
      await expect(
        vesting.connect(sftCollector).withdraw(sftId)
      ).to.be.revertedWith("Nothing to withdraw");
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
});
