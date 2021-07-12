import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { FlameToken, FlameTokenFactory, Vesting, VestingFactory } from "../typechain";
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
  let flameToken: FlameToken;
  let signers: SignerWithAddress[];

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    const flameTokenFactory = <FlameTokenFactory>await ethers.getContractFactory("FlameToken");
    flameToken = await flameTokenFactory.deploy(totalSupply);
    await flameToken.deployed();

    const vestingFactory = <VestingFactory>await ethers.getContractFactory("Vesting");
    vesting = await vestingFactory.deploy(flameToken.address, vestingParams);
    await vesting.deployed();

    await flameToken.transfer(vesting.address, totalAmount);
  });

});
