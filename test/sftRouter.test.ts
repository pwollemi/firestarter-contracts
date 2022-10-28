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
  FirestarterSftRouter,
} from "../typechain";
import {
  setNextBlockTimestamp,
  getLatestBlockTimestamp,
  mineBlock,
} from "../helper/utils";
import { deployContract } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe("FirestarterSFTRouter", () => {
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
  let sftRouter: FirestarterSftRouter;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let worker: SignerWithAddress;
  let sftCollector: SignerWithAddress;
  let sftId: number;

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

    sftRouter = <FirestarterSftRouter>(
      await deployContract("FirestarterSFTRouter")
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

    await sftRouter.initialize();

    await sftRouter.addVestingByAdmin(sft.address, vesting.address);

    await flameToken.transfer(vesting.address, totalAmount);
  });

  describe("addVestingByAdmin", () => {
    it("should revert when not admin", async () => {
      await expect(
        sftRouter
          .connect(worker)
          .addVestingByAdmin(sft.address, vesting.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("vested", () => {
    it("Should only release every interval", async () => {
      const startTime = (await getLatestBlockTimestamp()) + 10000;
      const lockEndTime = startTime + vestingParams.lockPeriod;

      const amount = totalAmount.div(10000);
      await vesting.setStartTime(startTime);
      await sft.mint(sftCollector.address, 0, false);

      const initialUnlockAmoumnt = amount
        .mul(vestingParams.initialUnlock)
        .div(1e10);
      const releaseAmount = amount.mul(vestingParams.releaseRate).div(1e10);

      await setNextBlockTimestamp(lockEndTime + 1);
      await mineBlock();

      expect(await sftRouter.vested(vesting.address, sftId)).to.be.equal(
        initialUnlockAmoumnt
      );

      await setNextBlockTimestamp(
        lockEndTime + vestingParams.releaseInterval - 1
      );
      await mineBlock();
      expect(await sftRouter.vested(vesting.address, sftId)).to.be.equal(
        initialUnlockAmoumnt
      );

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
      await expect(
        sftRouter.connect(sftCollector).withdraw(vesting.address, sftId)
      )
        .to.emit(vesting, "Withdraw")
        .withArgs(sftCollector.address, vestedAmount);
      const balance1 = await flameToken.balanceOf(sftCollector.address);

      expect(vestedAmount).to.be.equal(balance1.sub(balance0));
    });
  });
});
