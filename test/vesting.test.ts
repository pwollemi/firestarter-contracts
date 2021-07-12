import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { CustomToken, CustomTokenFactory, Vesting, VestingFactory } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp } from "./helpers";

chai.use(solidity);
const { assert, expect } = chai;

describe('Vesting', () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);
  const vestingParams = {
    vestingName: "Marketing",
    amountToBeVested: totalAmount,
    initalUnlock: 0,
    withdrawInterval: 365 * 24 * 3600,
    releaseRate: 100,
    lockPeriod: 180 * 24 * 3600
}

  let vesting: Vesting;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    const flameTokenFactory = <CustomTokenFactory>await ethers.getContractFactory("CustomToken");
    flameToken = await flameTokenFactory.deploy("Flame token", "FLAME", totalSupply);
    await flameToken.deployed();

    const vestingFactory = <VestingFactory>await ethers.getContractFactory("Vesting");
    vesting = await vestingFactory.deploy(flameToken.address, vestingParams);
    await vesting.deployed();

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
});
