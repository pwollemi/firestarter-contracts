import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";
import { CustomToken, CustomTokenFactory, Presale, PresaleFactory, Vesting, VestingFactory, Whitelist, WhitelistFactory } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployCampaign } from "../helper/deployer";

chai.use(solidity);
const { assert, expect } = chai;


const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);

describe('Presale', () => {
    let signers: SignerWithAddress[];
    let whitelist: Whitelist;
    let vesting: Vesting;
    let presale: Presale;
    let fundToken: CustomToken;
    let rewardToken: CustomToken;
    let vestingParams: any;
    let addresses: any;
    let presaleParams: any;
    let fakeUsers: { wallet: string; isKycPassed: boolean; maxAlloc: BigNumber; allowedPrivateSale: boolean, privateMaxAlloc: BigNumberish;}[] = [];
    let accuracy: BigNumber;

    before(async () => {
        signers = await ethers.getSigners();
        // 0, 1: owners
        //    2: project owner
    });

    beforeEach(async () => {
        const initialOwners = [signers[0].address, signers[1].address];

        fundToken = <CustomToken>await deployContract("CustomToken", "Fund Token", "FT", totalTokenSupply);
        rewardToken = <CustomToken>await deployContract("CustomToken", "Reward Token", "RT", totalTokenSupply);

        const timestamp = await getLatestBlockTimestamp();
        vestingParams = {
            vestingName: "FireStarter Presale",
            amountToBeVested: totalTokenSupply.div(5),
            initialUnlock: 2000000000, // 20%
            withdrawInterval: 60, // 1 min
            releaseRate: 372000, // release 10% every interval
            lockPeriod: 86400 * 7 * 2 // 2 weeks
        }
        addresses = {
            fundToken: fundToken.address,
            rewardToken: rewardToken.address,
            projectOwner: signers[2].address,
        };
        presaleParams = {
            rate: "450000000", // 1 Flame = 0.045 USD
            startTime: timestamp + 86400, // tomorrow
            period: 86400 * 7, // 1 week,
            serviceFee: "5000000000", // 5%,
            goalFunds: "1000000000000", // just placholder we can ignore for now,
            initialRewardsAmount: totalTokenSupply.div(5) // 10k tokens will be deposited to vesting
        };

        const project = await deployCampaign("Presale", initialOwners, vestingParams, addresses, presaleParams);
        whitelist = project.whitelist;
        vesting = project.vesting;
        presale = <Presale>project.presale;

        await fundToken.transfer(signers[1].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[2].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[3].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[4].address, totalTokenSupply.div(10));

        await fundToken.connect(signers[1]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[2]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[3]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[4]).approve(presale.address, ethers.constants.MaxUint256);

        fakeUsers = signers.slice(0, 5).map((signer, i) => ({
            wallet: signer.address,
            isKycPassed: i % 2 === 0,
            maxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: false,
            privateMaxAlloc: 0
          }));
        await whitelist.addToWhitelist(fakeUsers);

        accuracy = await presale.accuracy();
    });

    describe("endPrivateSale", async () => {
        it("Only owners can do this operation", async () => {
            await expect(presale.connect(signers[2]).endPrivateSale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).endPrivateSale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).endPrivateSale()).to.be.revertedWith("Requires Owner Role");

            await presale.connect(signers[0]).endPrivateSale();
            await presale.connect(signers[1]).endPrivateSale();
        });

        it("PrivateSaleDone event is emitted with correct params", async () => {
            const nextTimestamp = await getLatestBlockTimestamp() + 100;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.endPrivateSale())
                .to.emit(presale, "PrivateSaleDone")
                .withArgs(nextTimestamp);
        });
    });

    describe("setStartTime", async () => {
        it("Only owners can do this operation", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await expect(presale.connect(signers[2]).setStartTime(startTime)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).setStartTime(startTime)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).setStartTime(startTime)).to.be.revertedWith("Requires Owner Role");

            await presale.connect(signers[0]).setStartTime(startTime);
            await presale.connect(signers[1]).setStartTime(startTime);
        });

        it("Cannot set if alredy started", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await setNextBlockTimestamp(startTime + 10);
            await expect(presale.setStartTime(startTime)).to.be.revertedWith("setStartTime: Presale already started");
        });

        it("Must set future time", async () => {
            const startTime = await getLatestBlockTimestamp();
            await expect(presale.setStartTime(startTime)).to.be.revertedWith("setStartTime: Should be time in future");
        });

        it("Must end private slae", async () => {
            const startTime = await getLatestBlockTimestamp() + 100;
            await presale.setStartTime(startTime);
            expect(await presale.isPrivateSaleOver()).to.be.equal(true);
        });
        
        it("Time is set/event emitted", async () => {
            const startTime = await getLatestBlockTimestamp() + 100;
            await expect(presale.setStartTime(startTime))
                .to.emit(presale, "StartTimeSet")
                .withArgs(startTime);
            expect(await presale.startTime()).to.be.equal(startTime);
        });
    });

    describe("startPresale", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);

            await expect(presale.connect(signers[2]).startPresale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).startPresale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).startPresale()).to.be.revertedWith("Requires Owner Role");

            await presale.connect(signers[0]).startPresale();
        });

        it("Enough amount should be deposited", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();

            await expect(presale.startPresale()).to.be.revertedWith("Deposit enough rewardToken tokens to the vesting contract first!");
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.startPresale();
        });

        it("Private presale must have ended", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.startPresale()).to.be.revertedWith("startPresale: Private Sale has not been done yet!");
        });

        it("Can't be called if already started", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();

            await presale.startPresale();
            await expect(presale.startPresale()).to.be.revertedWith("startPresale: Presale has been already started!");
        });

        it("PresaleManuallyStarted event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await setNextBlockTimestamp(startTime - 100);
            await expect(presale.startPresale())
                .to.emit(presale, "PresaleManuallyStarted")
                .withArgs(startTime - 100);
        });

        it("startTime is reset to that timestamp", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await setNextBlockTimestamp(startTime - 100);
            await presale.startPresale();
            expect(await presale.startTime()).to.be.equal(startTime - 100);
        });
    });

    describe("Pause", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            await expect(presale.connect(signers[2]).pausePresaleByEmergency()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).pausePresaleByEmergency()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).pausePresaleByEmergency()).to.be.revertedWith("Requires Owner Role");
            await presale.pausePresaleByEmergency();
        });

        it("Can only be called while on going", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);

            await expect(presale.connect(signers[2]).pausePresaleByEmergency()).to.be.revertedWith("Presale is not in progress");
            await expect(presale.connect(signers[3]).pausePresaleByEmergency()).to.be.revertedWith("Presale is not in progress");
            await expect(presale.connect(signers[4]).pausePresaleByEmergency()).to.be.revertedWith("Presale is not in progress");
            await presale.startPresale();
            await presale.pausePresaleByEmergency();
        });

        it("Status variables are correctly set", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const pauseTime = await getLatestBlockTimestamp() + presaleParams.period - 100;
            await setNextBlockTimestamp(pauseTime);
            await presale.pausePresaleByEmergency();
            expect(await presale.isPresalePaused()).to.be.equal(true);
            expect(await presale.currentPresalePeriod()).to.be.equal(100);
        });

        it("PresalePaused event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const pauseTime = await getLatestBlockTimestamp() + presaleParams.period - 100;
            await setNextBlockTimestamp(pauseTime);
            await expect(presale.pausePresaleByEmergency())
                .to.emit(presale, "PresalePaused")
                .withArgs(pauseTime);
        });
    });

    describe("Resume", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.pausePresaleByEmergency();

            await expect(presale.connect(signers[2]).resumePresale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).resumePresale()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).resumePresale()).to.be.revertedWith("Requires Owner Role");
        });

        it("Can only be called while paused", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            await expect(presale.connect(signers[2]).resumePresale()).to.be.revertedWith("Presale is not paused");
            await expect(presale.connect(signers[3]).resumePresale()).to.be.revertedWith("Presale is not paused");
            await expect(presale.connect(signers[4]).resumePresale()).to.be.revertedWith("Presale is not paused");
        });

        it("Status variables are correctly set", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.pausePresaleByEmergency();
            await presale.resumePresale();
            const resumedTime = await getLatestBlockTimestamp();
            expect(await presale.isPresalePaused()).to.be.equal(false);
            expect(await presale.startTime()).to.be.equal(resumedTime);
        });

        it("PresaleResumed event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.pausePresaleByEmergency();

            const resumedTime = await getLatestBlockTimestamp() + 11;
            await setNextBlockTimestamp(resumedTime);
            await expect(presale.resumePresale())
                .to.emit(presale, "PresaleResumed")
                .withArgs(resumedTime);
        });
    });

    describe("isPresaleOnGoing", async () => {
        it("Ongoing by manual start", async () => {
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await presale.endPrivateSale();
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await presale.startPresale();
            expect(await presale.isPresaleGoing()).to.be.equal(true);
        });

        it("Ongoing auto start and end", async () => {
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);

            await setNextBlockTimestamp(startTime);
            await mineBlock();
            expect(await presale.isPresaleGoing()).to.be.equal(true);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await mineBlock();
            expect(await presale.isPresaleGoing()).to.be.equal(false);
        });

        it("Pause and resume", async () => {
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            await presale.pausePresaleByEmergency();
            expect(await presale.isPresaleGoing()).to.be.equal(false);

            const resumedTime = await getLatestBlockTimestamp() + 11;
            await setNextBlockTimestamp(resumedTime);
            await presale.resumePresale();
            expect(await presale.isPresaleGoing()).to.be.equal(true);
        });
    });

    describe("Deposit", async () => {
        it("Can only be called when ongoing", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await expect(presale.deposit("1")).to.be.revertedWith("Presale is not in progress");
        });

        it("Must be whitelisted user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await expect(presale.connect(signers[7]).deposit("1")).to.be.revertedWith("Deposit: Not exist on the whitelist");
        });

        it("Can't exceed maxAlloc", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            await expect(presale.connect(signers[1]).deposit(fakeUsers[1].maxAlloc.add(1))).to.be.revertedWith("Deposit: Can't exceed the maxAlloc!");

            // but succeeds with max allocation
            await presale.connect(signers[1]).deposit(fakeUsers[1].maxAlloc);
        });

        it("Deposit updates correct states", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            const rewardAmount = depositAmount.mul(accuracy).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount);

            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(depositAmount);
            expect(recpInfo.rtBalance).to.be.equal(rewardAmount);

            expect(await presale.publicSoldAmount()).to.be.equal(rewardAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(rewardAmount);
        });

        it("deposit amount is stacked", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            // 1st
            const depositAmount1 = fakeUsers[1].maxAlloc.div(2);
            const rewardAmount1 = depositAmount1.mul(accuracy).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount1);

            const recpInfo1 = await presale.recipients(signers[1].address);
            expect(recpInfo1.ftBalance).to.be.equal(depositAmount1);
            expect(recpInfo1.rtBalance).to.be.equal(rewardAmount1);

            expect(await presale.publicSoldAmount()).to.be.equal(rewardAmount1);

            const vestInfo1 = await vesting.recipients(signers[1].address);
            expect(vestInfo1.totalAmount).to.be.equal(rewardAmount1);

            // 2nd
            const depositAmount2 = fakeUsers[1].maxAlloc.div(4);
            const rewardAmount2 = depositAmount2.mul(accuracy).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount2);

            const recpInfo2 = await presale.recipients(signers[1].address);
            expect(recpInfo2.ftBalance).to.be.equal(depositAmount1.add(depositAmount2));
            expect(recpInfo2.rtBalance).to.be.equal(rewardAmount1.add(rewardAmount2));

            expect(await presale.publicSoldAmount()).to.be.equal(rewardAmount1.add(rewardAmount2));

            const vestInfo2 = await vesting.recipients(signers[1].address);
            expect(vestInfo2.totalAmount).to.be.equal(rewardAmount1.add(rewardAmount2));
        });

        it("Vested event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            const rewardAmount = depositAmount.mul(accuracy).div(presaleParams.rate);
            const nextTimestamp = await getLatestBlockTimestamp() + 10;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.connect(signers[1]).deposit(depositAmount))
                .to.emit(presale, "Vested")
                .withArgs(signers[1].address, rewardAmount, false, nextTimestamp);
        });
    });

    describe("Start vesting", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);

            await expect(presale.connect(signers[2]).startVesting()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).startVesting()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).startVesting()).to.be.revertedWith("Requires Owner Role");
            await presale.startVesting();
        });

        it("Can only be called when finished", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            await expect(presale.startVesting()).to.be.revertedWith("Presale has not been ended yet!");
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.startVesting();
        });

        it("Vesting starts correctly", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.startVesting();

            const curtime = await getLatestBlockTimestamp();
            expect(await vesting.startTime()).to.be.gte(curtime);
        });
    });

    describe("Withdraw funds", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);

            const treasury = signers[9].address;
            await expect(presale.connect(signers[2]).withdrawFunds(treasury)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).withdrawFunds(treasury)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).withdrawFunds(treasury)).to.be.revertedWith("Requires Owner Role");
            await presale.withdrawFunds(treasury);
        });

        it("Can only be called when finished", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            const treasury = signers[9].address;
            await expect(presale.withdrawFunds(treasury)).to.be.revertedWith("Presale has not been ended yet!");
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.withdrawFunds(treasury);
        });

        it("Correct amount is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).deposit(depositAmount);
            await presale.connect(signers[2]).deposit(depositAmount);
            await presale.connect(signers[3]).deposit(depositAmount);
            await presale.connect(signers[4]).deposit(depositAmount);

            const totalAmount = depositAmount.mul(4);           
            const feeAmount = totalAmount.mul(presaleParams.serviceFee).div(accuracy);

            const treasury = signers[9].address;
            
            const ownerBalance0 = await fundToken.balanceOf(addresses.projectOwner);
            const feeBalance0 = await fundToken.balanceOf(treasury);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.withdrawFunds(treasury);

            const ownerBalance1 = await fundToken.balanceOf(addresses.projectOwner);
            const feeBalance1 = await fundToken.balanceOf(treasury);

            expect(ownerBalance1.sub(ownerBalance0)).to.be.equal(totalAmount.sub(feeAmount));
            expect(feeBalance1.sub(feeBalance0)).to.be.equal(feeAmount);
        });

        it("WithdrawFunds event emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).deposit(depositAmount);
            await presale.connect(signers[2]).deposit(depositAmount);
            await presale.connect(signers[3]).deposit(depositAmount);
            await presale.connect(signers[4]).deposit(depositAmount);

            const totalAmount = depositAmount.mul(4);           
            const feeAmount = totalAmount.mul(presaleParams.serviceFee).div(accuracy);

            const treasury = signers[9].address;
            const withdrawTime = startTime + presaleParams.period + 1;
            await setNextBlockTimestamp(withdrawTime);
            const tx = await presale.withdrawFunds(treasury);
            const receipt = await tx.wait();

            const events = receipt.events?.filter((e) => e.event === "WithdrawFunds");
            assert(events?.[0].args?.receiver === addresses.projectOwner, "invalid receiver");
            assert(events?.[0].args?.amount.eq(totalAmount.sub(feeAmount)), "invalid amount");
            assert(events?.[0].args?.timestamp.eq(withdrawTime), "invalid timestamp");
            assert(events?.[1].args?.receiver === treasury, "invalid receiver");
            assert(events?.[1].args?.amount.eq(feeAmount), "invalid amount");
            assert(events?.[1].args?.timestamp.eq(withdrawTime), "invalid timestamp");
        });
    });

    describe("Withdraw Unsold tokens", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);

            await expect(presale.connect(signers[2]).withdrawUnsoldToken()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).withdrawUnsoldToken()).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).withdrawUnsoldToken()).to.be.revertedWith("Requires Owner Role");
            await presale.withdrawUnsoldToken();
        });

        it("Can only be called when finished", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            await expect(presale.withdrawUnsoldToken()).to.be.revertedWith("Presale has not been ended yet!");
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.withdrawUnsoldToken();
        });

        it("Correct amount is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).deposit(depositAmount);
            await presale.connect(signers[2]).deposit(depositAmount);
            await presale.connect(signers[3]).deposit(depositAmount);
            await presale.connect(signers[4]).deposit(depositAmount);

            const totalAmount = depositAmount.mul(4);
            const soldAmount = totalAmount.mul(accuracy).div(presaleParams.rate);
            const unsoldAmount = presaleParams.initialRewardsAmount.sub(soldAmount);
            
            const ownerBalance0 = await rewardToken.balanceOf(addresses.projectOwner);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.withdrawUnsoldToken();

            const ownerBalance1 = await rewardToken.balanceOf(addresses.projectOwner);

            expect(ownerBalance1.sub(ownerBalance0)).to.be.equal(unsoldAmount);
        });

        it("WithdrawUnsoldToken event emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).deposit(depositAmount);
            await presale.connect(signers[2]).deposit(depositAmount);
            await presale.connect(signers[3]).deposit(depositAmount);
            await presale.connect(signers[4]).deposit(depositAmount);

            const totalAmount = depositAmount.mul(4);
            const soldAmount = totalAmount.mul(accuracy).div(presaleParams.rate);
            const unsoldAmount = presaleParams.initialRewardsAmount.sub(soldAmount);
            
            const withdrawTime = startTime + presaleParams.period + 1;
            await setNextBlockTimestamp(withdrawTime);
            await expect(presale.withdrawUnsoldToken())
                .to.emit(presale, "WithdrawUnsoldToken")
                .withArgs(addresses.projectOwner, unsoldAmount, withdrawTime);
        });
    });
});
