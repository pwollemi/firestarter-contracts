/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { CustomToken, TokenLock } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock, duration } from "../helper/utils";
import { deployContract, deployProxy } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe('Locking', () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);

  let tokenLock: TokenLock;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    tokenLock = <TokenLock>await deployProxy("TokenLock", flameToken.address);

    await flameToken.transfer(signers[1].address, totalAmount.div(5));
    await flameToken.transfer(signers[2].address, totalAmount.div(5));
    await flameToken.transfer(signers[3].address, totalAmount.div(5));

    await flameToken.connect(signers[1]).approve(tokenLock.address, totalAmount.div(5));
    await flameToken.connect(signers[2]).approve(tokenLock.address, totalAmount.div(5));
    await flameToken.connect(signers[3]).approve(tokenLock.address, totalAmount.div(5));
  });

  describe("initialize", async () => {
    it("Validiation of initilize params", async () => {
      await expect(deployProxy("TokenLock", ethers.constants.AddressZero)).to.be.revertedWith("initialize: token address cannot be zero");
    });
  });

  describe("lock", async () => {
    it("Correct amount is locked", async () => {
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockAmount = totalAmount.div(10);

      const balance0 =  await flameToken.balanceOf(tokenLock.address);
      const totalLocked0 = await tokenLock.getTotalLocked();

      await setNextBlockTimestamp(timestamp);
      await tokenLock.connect(signers[1]).lock(lockAmount);

      const balance1 = await flameToken.balanceOf(tokenLock.address);
      const totalLocked1 = await tokenLock.getTotalLocked();

      const lockInfo = await tokenLock.lockedBalance(signers[1].address);
      const lockedAmount = await tokenLock.getLockedAmount(signers[1].address);
      expect(lockInfo.amount).to.be.equal(lockAmount).to.be.equal(lockedAmount);
      expect(lockInfo.lastLockedTime).to.be.equal(timestamp);
      expect(totalLocked1.sub(totalLocked0)).to.be.equal(lockAmount);
      expect(balance1.sub(balance0)).to.be.equal(lockAmount);
    });

    it("lock amount is stacked", async () => {
        const lockAmount1 = totalAmount.div(10);
        const lockAmount2 = totalAmount.div(100);
  
        await tokenLock.connect(signers[1]).lock(lockAmount1);
        const lockInfo1 = await tokenLock.lockedBalance(signers[1].address);
        expect(lockInfo1.amount).to.be.equal(lockAmount1);

        await tokenLock.connect(signers[1]).lock(lockAmount2);
        const lockInfo2 = await tokenLock.lockedBalance(signers[1].address);
        expect(lockInfo2.amount).to.be.equal(lockAmount1.add(lockAmount2));
    });

    it("Locked event is emitted with correct params", async () => {
        const lockAmount = totalAmount.div(10);
        await expect(tokenLock.connect(signers[1]).lock(lockAmount))
            .to.emit(tokenLock, "Locked")
            .withArgs(signers[1].address, lockAmount);
    });
  });

  describe("getPenalty", async () => {
    it("Revert if none locked", async () => {
      await expect(tokenLock.getPenalty(signers[1].address)).to.be.revertedWith("Not locked");
    });

    it("Penalty is correct per passed days", async () => {
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockAmount = totalAmount.div(10);
      await setNextBlockTimestamp(timestamp);
      await tokenLock.connect(signers[1]).lock(lockAmount);

      // 10 %
      await setNextBlockTimestamp(timestamp + 86400 * 10 - 1);
      await mineBlock();
      let penalty = await tokenLock.getPenalty(signers[1].address)
      expect(penalty[1]).to.be.equal(lockAmount.div(10));

      // 5 %
      await setNextBlockTimestamp(timestamp + 86400 * 20 - 1);
      await mineBlock();
      penalty = await tokenLock.getPenalty(signers[1].address)
      expect(penalty[1]).to.be.equal(lockAmount.div(20));

      // 3 %
      await setNextBlockTimestamp(timestamp + 86400 * 30 - 1);
      await mineBlock();
      penalty = await tokenLock.getPenalty(signers[1].address)
      expect(penalty[1]).to.be.equal(lockAmount.mul(3).div(100));

      // 0 %
      await setNextBlockTimestamp(timestamp + 86400 * 30);
      await mineBlock();
      penalty = await tokenLock.getPenalty(signers[1].address)
      expect(penalty[1]).to.be.equal(0);
    });
  });

  describe("unlock", async () => {
    it("Revert if nothing locked", async () => {
        await expect(tokenLock.connect(signers[1]).unlock(1)).to.be.revertedWith("Not locked");
    });

    it("Cannot unlock more than locked amount", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);

        await expect(tokenLock.connect(signers[1]).unlock(lockAmount.add(1))).to.be.revertedWith("Exceeds locked amount");
    });

    it("Before 10 days(ensure correct amount burned, transferred, subtracted)", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);
  
        const totalLocked0 = await tokenLock.getTotalLocked();
        const lockInfo0 = await tokenLock.lockedBalance(signers[1].address);
        const balance0 = await flameToken.balanceOf(signers[1].address);
        const burned0 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        // 10 %
        const penalty = lockAmount.div(10);
        await setNextBlockTimestamp(timestamp + 86400 * 10 - 1);
        await tokenLock.connect(signers[1]).unlock(lockAmount)

        const totalLocked1 = await tokenLock.getTotalLocked();
        const lockInfo1 = await tokenLock.lockedBalance(signers[1].address);
        const balance1 = await flameToken.balanceOf(signers[1].address);
        const burned1 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        expect(totalLocked0.sub(totalLocked1)).to.be.equal(lockAmount);
        expect(lockInfo0.amount.sub(lockInfo1.amount)).to.be.equal(lockAmount);
        expect(balance1.sub(balance0)).to.be.equal(lockAmount.sub(penalty));
        expect(burned1.sub(burned0)).to.be.equal(penalty);
    });

    it("Before 20 days(ensure correct amount burned, transferred, subtracted)", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);
  
        const totalLocked0 = await tokenLock.getTotalLocked();
        const lockInfo0 = await tokenLock.lockedBalance(signers[1].address);
        const balance0 = await flameToken.balanceOf(signers[1].address);
        const burned0 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        // 5 %
        const penalty = lockAmount.div(20);
        await setNextBlockTimestamp(timestamp + 86400 * 20 - 1);
        await tokenLock.connect(signers[1]).unlock(lockAmount)

        const totalLocked1 = await tokenLock.getTotalLocked();
        const lockInfo1 = await tokenLock.lockedBalance(signers[1].address);
        const balance1 = await flameToken.balanceOf(signers[1].address);
        const burned1 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        expect(totalLocked0.sub(totalLocked1)).to.be.equal(lockAmount);
        expect(lockInfo0.amount.sub(lockInfo1.amount)).to.be.equal(lockAmount);
        expect(balance1.sub(balance0)).to.be.equal(lockAmount.sub(penalty));
        expect(burned1.sub(burned0)).to.be.equal(penalty);
    });

    it("Before 30 days(ensure correct amount burned, transferred, subtracted)", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);
  
        const totalLocked0 = await tokenLock.getTotalLocked();
        const lockInfo0 = await tokenLock.lockedBalance(signers[1].address);
        const balance0 = await flameToken.balanceOf(signers[1].address);
        const burned0 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        // 3 %
        const penalty = lockAmount.mul(3).div(100);
        await setNextBlockTimestamp(timestamp + 86400 * 30 - 1);
        await tokenLock.connect(signers[1]).unlock(lockAmount)

        const totalLocked1 = await tokenLock.getTotalLocked();
        const lockInfo1 = await tokenLock.lockedBalance(signers[1].address);
        const balance1 = await flameToken.balanceOf(signers[1].address);
        const burned1 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        expect(totalLocked0.sub(totalLocked1)).to.be.equal(lockAmount);
        expect(lockInfo0.amount.sub(lockInfo1.amount)).to.be.equal(lockAmount);
        expect(balance1.sub(balance0)).to.be.equal(lockAmount.sub(penalty));
        expect(burned1.sub(burned0)).to.be.equal(penalty);
    });

    it("After 30 days(Ensure correct amount burned, transferred, subtracted)", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);
  
        const totalLocked0 = await tokenLock.getTotalLocked();
        const lockInfo0 = await tokenLock.lockedBalance(signers[1].address);
        const balance0 = await flameToken.balanceOf(signers[1].address);
        const burned0 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        // 0 %
        const penalty = 0;
        await setNextBlockTimestamp(timestamp + 86400 * 30 + 1);
        await tokenLock.connect(signers[1]).unlock(lockAmount)

        const totalLocked1 = await tokenLock.getTotalLocked();
        const lockInfo1 = await tokenLock.lockedBalance(signers[1].address);
        const balance1 = await flameToken.balanceOf(signers[1].address);
        const burned1 = await flameToken.balanceOf("0x000000000000000000000000000000000000dead");

        expect(totalLocked0.sub(totalLocked1)).to.be.equal(lockAmount);
        expect(lockInfo0.amount.sub(lockInfo1.amount)).to.be.equal(lockAmount);
        expect(balance1.sub(balance0)).to.be.equal(lockAmount.sub(penalty));
        expect(burned1.sub(burned0)).to.be.equal(penalty);
    });

    it("lockExpiresAt for specific wallet", async () => {
      await tokenLock.setOwner(signers[0].address);

      const lockAmount = totalAmount.div(10);
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockExpiresAt = duration.days(30).toNumber() + timestamp;
      await setNextBlockTimestamp(timestamp);
      await tokenLock.connect(signers[1]).lock(lockAmount);

      await tokenLock.setLockExpiresAt(signers[1].address, lockExpiresAt)
      await expect(tokenLock.connect(signers[1]).unlock(lockAmount)).to.be.revertedWith("Still in the lock period");

      await setNextBlockTimestamp(lockExpiresAt);
      await tokenLock.connect(signers[1]).unlock(lockAmount);
    });

    it("set batch lockExpiresAt for specific wallets", async () => {
      await tokenLock.setOwner(signers[0].address);

      const lockAmount = totalAmount.div(10);
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockExpiresAt = duration.days(30).toNumber() + timestamp;
      await setNextBlockTimestamp(timestamp);
      await tokenLock.connect(signers[1]).lock(lockAmount);
      await tokenLock.connect(signers[2]).lock(lockAmount);

      await tokenLock.setBatchLockExpiresAt([signers[1].address, signers[2].address], [lockExpiresAt, lockExpiresAt])
      await expect(tokenLock.connect(signers[1]).unlock(lockAmount)).to.be.revertedWith("Still in the lock period");
      await expect(tokenLock.connect(signers[2]).unlock(lockAmount)).to.be.revertedWith("Still in the lock period");

      await setNextBlockTimestamp(lockExpiresAt);
      await tokenLock.connect(signers[1]).unlock(lockAmount);
      await tokenLock.connect(signers[2]).unlock(lockAmount);
    });
    
    it("Unlocked event is emitted with correct params", async () => {
        const timestamp = await getLatestBlockTimestamp() + 10;
        const lockAmount = totalAmount.div(10);
        await setNextBlockTimestamp(timestamp);
        await tokenLock.connect(signers[1]).lock(lockAmount);
  
        await setNextBlockTimestamp(timestamp + 86400 * 30 + 1);
        await expect(tokenLock.connect(signers[1]).unlock(lockAmount))
            .to.emit(tokenLock, "Unlocked")
            .withArgs(signers[1].address, lockAmount);
      });
  });


  describe("setOwner", async () => {
    it("can set when owner is not set, can transfer ownership", async () => {
      await tokenLock.setOwner(signers[2].address);
      await expect(tokenLock.setOwner(signers[3].address)).to.be.revertedWith("You're not owner or owner is already set to another person");
      await tokenLock.connect(signers[2]).setOwner(signers[3].address);
      await tokenLock.connect(signers[3]).setOwner(signers[2].address);
    });
  });

  describe("setLockExpiresAt", async () => {
    it("owner can set it", async () => {
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockExpiresAt = duration.days(30).toNumber() + timestamp;
      await tokenLock.setOwner(signers[0].address);
      await expect(tokenLock.connect(signers[2]).setLockExpiresAt(signers[3].address, lockExpiresAt)).to.be.revertedWith("TokenLock: caller is not the owner nor the worker");
      await expect(tokenLock.connect(signers[3]).setLockExpiresAt(signers[2].address, lockExpiresAt)).to.be.revertedWith("TokenLock: caller is not the owner nor the worker");
      await tokenLock.connect(signers[0]).setLockExpiresAt(signers[2].address, lockExpiresAt);
    });

    it("owner can set it", async () => {
      const timestamp = await getLatestBlockTimestamp() + 10;
      const lockExpiresAt = duration.days(30).toNumber() + timestamp;
      await tokenLock.setOwner(signers[1].address);
      await expect(tokenLock.connect(signers[2]).setLockExpiresAt(signers[3].address, lockExpiresAt)).to.be.revertedWith("TokenLock: caller is not the owner nor the worker");
      await expect(tokenLock.connect(signers[3]).setLockExpiresAt(signers[2].address, lockExpiresAt)).to.be.revertedWith("TokenLock: caller is not the owner nor the worker");
      await tokenLock.connect(signers[1]).setWorker(signers[0].address);
      await tokenLock.connect(signers[0]).setLockExpiresAt(signers[2].address, lockExpiresAt);
    });
  });

  describe("set/remove Worker", () => {
    it("setWorker", async () => {
      await tokenLock.setOwner(signers[0].address);
      await expect(tokenLock.connect(signers[2]).setWorker(signers[2].address)).to.be.revertedWith("Only owner can do this");
      await expect(tokenLock.connect(signers[3]).setWorker(signers[2].address)).to.be.revertedWith("Only owner can do this");
      await expect(tokenLock.connect(signers[4]).setWorker(signers[2].address)).to.be.revertedWith("Only owner can do this");

      await tokenLock.setWorker(signers[2].address);
      expect(await tokenLock.worker()).to.be.equal(signers[2].address);
    });

    it("removeWorker", async () => {
      await tokenLock.setOwner(signers[0].address);
      await expect(tokenLock.connect(signers[2]).removeWorker()).to.be.revertedWith("Only owner can do this");
      await expect(tokenLock.connect(signers[3]).removeWorker()).to.be.revertedWith("Only owner can do this");
      await expect(tokenLock.connect(signers[4]).removeWorker()).to.be.revertedWith("Only owner can do this");

      await tokenLock.removeWorker();
      expect(await tokenLock.worker()).to.be.equal(ethers.constants.AddressZero);
    });
  });
});
