import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { Whitelist } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp } from "../helper/utils";
import { deployProxy } from "../helper/deployer";

chai.use(solidity);
const { assert, expect } = chai;

describe('Whitelist', () => {
  let whitelist: Whitelist;
  let signers: SignerWithAddress[];
  let owners: string[];
  let fakeUsers: { wallet: string; isKycPassed: boolean; maxAlloc: BigNumber; allowedPrivateSale: boolean, privateMaxAlloc: BigNumber;}[] = [];

  before(async () => {
    signers = await ethers.getSigners();
    owners = [signers[0].address, signers[1].address];

    fakeUsers = signers.map((signer, i) => ({
      wallet: signer.address,
      isKycPassed: i % 2 === 0,
      maxAlloc: BigNumber.from((i + 1) * 10000000000),
      allowedPrivateSale: false,
      privateMaxAlloc: BigNumber.from("0")
    }));
  });

  beforeEach(async () => {
    whitelist = <Whitelist>await deployProxy("Whitelist", owners)
  });

  describe("addToWhitelist", () => {
    it("Security", async () => {
      await expect(whitelist.connect(signers[2]).addToWhitelist(fakeUsers)).to.be.revertedWith("Requires Owner Role");
      await expect(whitelist.connect(signers[3]).addToWhitelist(fakeUsers)).to.be.revertedWith("Requires Owner Role");
      await expect(whitelist.connect(signers[4]).addToWhitelist(fakeUsers)).to.be.revertedWith("Requires Owner Role");
      await whitelist.connect(signers[0]).addToWhitelist(fakeUsers.slice(0, 4));
      await whitelist.connect(signers[1]).addToWhitelist(fakeUsers.slice(5));
    });
  
    it("Attempt to add one user. AddedOrRemoved event is emitted.", async () => {
      const nextTimestamp = (await getLatestBlockTimestamp()) + 100;
      const fakeUser = {
        wallet: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
        isKycPassed: true,
        maxAlloc: "100000000000",
        allowedPrivateSale: false,
        privateMaxAlloc: 0
      }
  
      await setNextBlockTimestamp(nextTimestamp);
      await expect(whitelist.addToWhitelist([fakeUser]))
        .to.emit(whitelist, "AddedOrRemoved")
        .withArgs(true, fakeUser.wallet, nextTimestamp);

      expect(await whitelist.totalUsers()).to.equal(1);

      const userInfo = await whitelist.getUser(fakeUser.wallet);
      assert(userInfo[0] === fakeUser.wallet, "Wallet address should be matched.")
      assert(userInfo[1] === fakeUser.isKycPassed, "KYC passed status should be matched.")
      assert(userInfo[2].eq(fakeUser.maxAlloc), "Max allocation should be matched.")
      assert(userInfo[3] === fakeUser.allowedPrivateSale, "Max allocation should be matched.")
      assert(userInfo[4].eq(fakeUser.privateMaxAlloc), "Max allocation should be matched.")
    });

  
    it("Attempt to add multiple users. AddedOrRemoved event is emitted.", async () => {
      const nextTimestamp = (await getLatestBlockTimestamp()) + 100;
      await setNextBlockTimestamp(nextTimestamp);
      const tx = await whitelist.addToWhitelist(fakeUsers);
      const receipt = await tx.wait()

      expect(await whitelist.totalUsers()).to.equal(fakeUsers.length);

      await Promise.all(fakeUsers.map(async (fakeUser, i) => {
        const userInfo = await whitelist.getUser(fakeUser.wallet);
        assert(userInfo[0] === fakeUser.wallet, "Wallet address should be matched.")
        assert(userInfo[1] === fakeUser.isKycPassed, "KYC passed status should be matched.")
        assert(userInfo[2].eq(fakeUser.maxAlloc), "Max allocation should be matched.")
        assert(userInfo[3] === fakeUser.allowedPrivateSale, "Max allocation should be matched.")
        assert(userInfo[4].eq(fakeUser.privateMaxAlloc), "Max allocation should be matched.")
  
        const event = receipt.events?.[i];
        assert(event?.event === "AddedOrRemoved");
        assert(event?.args?.added === true, "Should be added event.")
        assert(event?.args?.user === fakeUser.wallet, "Wallet address should be matched.")
        assert(event?.args?.timestamp.eq(nextTimestamp), "Timestamp should be matched.")
      }));
    });
  });

  describe("removeFromWhitelist", () => {
    it("Security", async () => {
      await expect(whitelist.connect(signers[2]).removeFromWhitelist([signers[0].address])).to.be.revertedWith("Requires Owner Role");
      await expect(whitelist.connect(signers[3]).removeFromWhitelist([signers[0].address])).to.be.revertedWith("Requires Owner Role");
      await expect(whitelist.connect(signers[4]).removeFromWhitelist([signers[0].address])).to.be.revertedWith("Requires Owner Role");
      await whitelist.connect(signers[0]).removeFromWhitelist([signers[0].address]);
      await whitelist.connect(signers[1]).removeFromWhitelist([signers[0].address]);
    });
  
    it("Attempt to remove one user. AddedOrRemoved event is emitted.", async () => {
      const nextTimestamp = (await getLatestBlockTimestamp()) + 100;
      const fakeUser = {
        wallet: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
        isKycPassed: true,
        maxAlloc: "100000000000",
        allowedPrivateSale: false,
        privateMaxAlloc: 0
      }
      await whitelist.addToWhitelist([fakeUser]);
  
      await setNextBlockTimestamp(nextTimestamp);
      await expect(whitelist.removeFromWhitelist([fakeUser.wallet]))
        .to.emit(whitelist, "AddedOrRemoved")
        .withArgs(false, fakeUser.wallet, nextTimestamp);

      expect(await whitelist.totalUsers()).to.equal(0);

      const userInfo = await whitelist.getUser(fakeUser.wallet);
      assert(userInfo[0] === ethers.constants.AddressZero, "Wallet address should be zero.")
      assert(userInfo[1] === false, "KYC passed status should be false.")
      assert(userInfo[2].eq(0), "Max allocation should be zero.")
      assert(userInfo[3] === false, "Max allocation should be matched.")
      assert(userInfo[4].eq(0), "Max allocation should be matched.")
  });

  
    it("Attempt to remove multiple users. AddedOrRemoved event is emitted.", async () => {
      const nextTimestamp = (await getLatestBlockTimestamp()) + 100;
      await whitelist.addToWhitelist(fakeUsers);

      const removeList = fakeUsers.slice(0, 5);

      await setNextBlockTimestamp(nextTimestamp);
      const tx = await whitelist.removeFromWhitelist(removeList.map((u) => u.wallet));
      const receipt = await tx.wait();

      expect(await whitelist.totalUsers()).to.equal(fakeUsers.length - 5);

      await Promise.all(removeList.map(async (fakeUser, i) => {
        const userInfo = await whitelist.getUser(fakeUser.wallet);
        assert(userInfo[0] === ethers.constants.AddressZero, "Wallet address should be zero.")
        assert(userInfo[1] === false, "KYC passed status should be false.")
        assert(userInfo[2].eq(0), "Max allocation should be zero.")
        assert(userInfo[3] === false, "Max allocation should be matched.")
        assert(userInfo[4].eq(0), "Max allocation should be matched.")

        const event = receipt.events?.[i];
        assert(event?.event === "AddedOrRemoved");
        assert(event?.args?.added === false, "Should be added event.")
        assert(event?.args?.user === fakeUser.wallet, "Wallet address should be matched.")
        assert(event?.args?.timestamp.eq(nextTimestamp), "Timestamp should be matched.")
      }));
    });
  });
});