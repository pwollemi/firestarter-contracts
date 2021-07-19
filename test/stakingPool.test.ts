/* eslint-disable no-await-in-loop */
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { CustomToken, StakingPool } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract } from "../helper/deployer";
import { BigNumber } from "ethers";

chai.use(solidity);
const { expect } = chai;

describe('Staking Pool', () => {
  const totalSupply = ethers.utils.parseUnits("100000000", 18);
  const totalAmount = ethers.utils.parseUnits("20000000", 18);

  let stakingPool: StakingPool;
  let lpToken: CustomToken;
  let flameToken: CustomToken;
  let signers: SignerWithAddress[];
  let startTime: number;
  let stakingPeriod: BigNumber;

  before(async () => {
    signers = await ethers.getSigners();
  });

  beforeEach(async () => {
    startTime = await getLatestBlockTimestamp() + 1000;

    lpToken = <CustomToken>await deployContract("CustomToken", "Flame-USDC QS LP token", "FLAME-USDC", totalSupply);
    flameToken = <CustomToken>await deployContract("CustomToken", "Flame token", "FLAME", totalSupply);
    stakingPool = <StakingPool>await deployContract("StakingPool", lpToken.address, flameToken.address, startTime, 40);
    stakingPeriod = await stakingPool.stakingPeriod();

    await flameToken.transfer(stakingPool.address, ethers.utils.parseUnits("2500000", 18));

    await lpToken.transfer(signers[1].address, totalAmount.div(5));
    await lpToken.transfer(signers[2].address, totalAmount.div(5));
    await lpToken.transfer(signers[3].address, totalAmount.div(5));

    await lpToken.connect(signers[1]).approve(stakingPool.address, totalAmount.div(5));
    await lpToken.connect(signers[2]).approve(stakingPool.address, totalAmount.div(5));
    await lpToken.connect(signers[3]).approve(stakingPool.address, totalAmount.div(5));
  });

  describe("Update staking params", () => {
    const newAPY = 50;
    const newPenaltyPeriod = 50 * 86400;
    const newStakingPeriod = 100 * 86400;

    it("Only owner can do these operation", async () => {
      await expect(stakingPool.connect(signers[1]).updateAPY(newAPY)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(stakingPool.connect(signers[1]).updateEarlyWithdrawal(newPenaltyPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(stakingPool.connect(signers[1]).updateStakingPeriod(newStakingPeriod)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("It correctly updates information", async () => {
      await stakingPool.updateAPY(newAPY);
      await stakingPool.updateEarlyWithdrawal(newPenaltyPeriod);
      await stakingPool.updateStakingPeriod(newStakingPeriod);

      expect(await stakingPool.rewardAPY()).to.be.equal(newAPY);
      expect(await stakingPool.earlyWithdrawal()).to.be.equal(newPenaltyPeriod);
      expect(await stakingPool.stakingPeriod()).to.be.equal(newStakingPeriod);
    });
  });

  describe("Staking", () => {
    it("Pool should be open", () => {
      await expect(stakingPool.stake(1)).to.be.revertedWith("Stake: Pool is not open");
      await setNextBlockTimestamp(startTime + 1);
      await stakingPool.stake(1);
      await setNextBlockTimestamp(startTime +  + 1);
      await expect(stakingPool.stake(1)).to.be.revertedWith("Stake: Pool is not open");
    });

    it("Cannot stake zero amount", () => {
      await expect(stakingPool.)
    });
  });
});
