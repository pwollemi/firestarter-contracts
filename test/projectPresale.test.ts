import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";
import { CustomToken, ProjectPresale, Vesting, Whitelist } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployCampaign } from "../helper/deployer";

chai.use(solidity);
const { expect } = chai;

describe('Project Presale', () => {
    const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);

    let signers: SignerWithAddress[];
    let whitelist: Whitelist;
    let vesting: Vesting;
    let presale: ProjectPresale;
    let fundToken: CustomToken;
    let rewardToken: CustomToken;
    let vestingParams: any;
    let addresses: any;
    let presaleParams: any;
    let fakeUsers: { wallet: string; isKycPassed: boolean; publicMaxAlloc: BigNumber; allowedPrivateSale: boolean, privateMaxAlloc: BigNumberish;}[] = [];
    let ACCURACY: BigNumber;

    before(async () => {
        signers = await ethers.getSigners();
        // 0, 1: owners
        //    2: project owner
    });

    beforeEach(async () => {
        fundToken = <CustomToken>await deployContract("CustomToken", "Fund Token", "FT", totalTokenSupply);
        rewardToken = <CustomToken>await deployContract("CustomToken", "Reward Token", "RT", totalTokenSupply);

        const timestamp = await getLatestBlockTimestamp();
        vestingParams = {
            vestingName: "FireStarter Presale",
            amountToBeVested: totalTokenSupply.div(5),
            initialUnlock: 1000000000, // 10%
            releaseInterval: 60, // 1 min
            releaseRate: 23150, // release 10% every month
            lockPeriod: 60, // 1min
            vestingPeriod: 86400 * 30 * 8 // 8 month
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
            initialRewardsAmount: totalTokenSupply.div(5) // 10k tokens will be deposited to vesting
        };

        const project = await deployCampaign("ProjectPresale", vestingParams, addresses, presaleParams);
        whitelist = project.whitelist;
        vesting = project.vesting;
        presale = <ProjectPresale>project.presale;

        await fundToken.transfer(signers[1].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[2].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[3].address, totalTokenSupply.div(10));
        await fundToken.transfer(signers[4].address, totalTokenSupply.div(10));

        await fundToken.connect(signers[0]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[1]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[2]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[3]).approve(presale.address, ethers.constants.MaxUint256);
        await fundToken.connect(signers[4]).approve(presale.address, ethers.constants.MaxUint256);

        fakeUsers = signers.slice(0, 5).map((signer, i) => ({
            wallet: signer.address,
            isKycPassed: true,
            publicMaxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: true,
            privateMaxAlloc: totalTokenSupply.div(2000)
          }));

        // add one user that hasn't passed KYC
        fakeUsers.push({
            wallet: signers[6].address,
            isKycPassed: false,
            publicMaxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: false,
            privateMaxAlloc: 0
          })

        fakeUsers[3].allowedPrivateSale = false;
        fakeUsers[4].allowedPrivateSale = false;
        await whitelist.addToWhitelist(fakeUsers);

        ACCURACY = await presale.ACCURACY();
    });

    describe("Deposit PrivateSale", async () => {
        it("Can do this only when enough amount is deposited", async () => {
            await expect(presale.depositPrivateSale(1)).to.be.revertedWith("Deposit enough rewardToken tokens to the vesting contract first!");
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(1);
        });

        it("Can't deposit if private sale is over", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(1);
            await presale.endPrivateSale();
            await expect(presale.depositPrivateSale(1)).to.be.revertedWith("depositPrivateSale: Private Sale is ended!");
        });

        it("Must be whitelisted user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[7]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not exist on the whitelist");
        });

        it("Must be kyc passed user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[6]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not passed KYC");
        });

        it("Must be private sale allowed user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[3]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");
            await expect(presale.connect(signers[4]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");
        });

        it("Can't exceed publicMaxAlloc", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount.add(1))).to.be.revertedWith("Deposit: Can't exceed the privateMaxAlloc!");

            // but succeeds with max allocation
            await presale.connect(signers[1]).depositPrivateSale(depositAmount);
        });

        it("Deposit updates correct states", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount);

            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(depositAmount);
            expect(recpInfo.rtBalance).to.be.equal(rewardAmount);

            expect(await presale.privateSoldAmount()).to.be.equal(rewardAmount);
            expect(await presale.privateSoldFunds(signers[1].address)).to.be.equal(depositAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(rewardAmount);
        });

        it("Can deposit full allocation amount in private and public sale", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            const depositAmount1 = BigNumber.from(fakeUsers[1].privateMaxAlloc);
            const depositAmount2 = fakeUsers[1].publicMaxAlloc;
            const rewardAmount1 = depositAmount1.mul(ACCURACY).div(presaleParams.rate);
            const rewardAmount2 = depositAmount2.mul(ACCURACY).div(presaleParams.rate);

            await presale.connect(signers[1]).depositPrivateSale(depositAmount1);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.connect(signers[1]).deposit(depositAmount2);

            const totalDepositAmount = depositAmount1.add(depositAmount2);
            const totalRwdAmount = totalDepositAmount.mul(ACCURACY).div(presaleParams.rate);
            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(totalDepositAmount);
            expect(recpInfo.rtBalance).to.be.equal(totalRwdAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(totalRwdAmount);
        });

        it("deposit amount is stacked", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            // 1st
            const depositAmount1 = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount1 = depositAmount1.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount1);

            const recpInfo1 = await presale.recipients(signers[1].address);
            expect(recpInfo1.ftBalance).to.be.equal(depositAmount1);
            expect(recpInfo1.rtBalance).to.be.equal(rewardAmount1);

            expect(await presale.privateSoldAmount()).to.be.equal(rewardAmount1);
            expect(await presale.privateSoldFunds(signers[1].address)).to.be.equal(depositAmount1);

            const vestInfo1 = await vesting.recipients(signers[1].address);
            expect(vestInfo1.totalAmount).to.be.equal(rewardAmount1);

            // 2nd
            const depositAmount2 = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(4);
            const rewardAmount2 = depositAmount2.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount2);

            const recpInfo2 = await presale.recipients(signers[1].address);
            expect(recpInfo2.ftBalance).to.be.equal(depositAmount1.add(depositAmount2));
            expect(recpInfo2.rtBalance).to.be.equal(rewardAmount1.add(rewardAmount2));

            expect(await presale.privateSoldAmount()).to.be.equal(rewardAmount1.add(rewardAmount2));
            expect(await presale.privateSoldFunds(signers[1].address)).to.be.equal(depositAmount1.add(depositAmount2));

            const vestInfo2 = await vesting.recipients(signers[1].address);
            expect(vestInfo2.totalAmount).to.be.equal(rewardAmount1.add(rewardAmount2));
        });

        it("Vested event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            const nextTimestamp = await getLatestBlockTimestamp() + 10;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount))
                .to.emit(presale, "Vested")
                .withArgs(signers[1].address, rewardAmount, true, nextTimestamp);
        });
    });

    describe("analysis support", () => {
        it("participants list - private and public", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            // private sale
            await presale.connect(signers[0]).depositPrivateSale(amount);
            await presale.connect(signers[1]).depositPrivateSale(amount);
            await presale.connect(signers[2]).depositPrivateSale(amount);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            await presale.connect(signers[3]).deposit(1);
            await presale.connect(signers[4]).deposit(1);

            // check list
            const participants = await presale.getParticipants(0, 5);
            expect(await presale.participantCount()).to.be.equal(5);
            expect(participants.length).to.be.equal(5);
            expect(participants).to.be.eql([
                signers[0].address,
                signers[1].address,
                signers[2].address,
                signers[3].address,
                signers[4].address
            ]);
        });

        it("participants list - no duplication", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            // private sale
            await presale.connect(signers[0]).depositPrivateSale(amount);
            await presale.connect(signers[1]).depositPrivateSale(amount);
            await presale.connect(signers[2]).depositPrivateSale(amount);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            await presale.connect(signers[1]).deposit(1);
            await presale.connect(signers[2]).deposit(1);
            await presale.connect(signers[4]).deposit(1);
            await presale.connect(signers[1]).deposit(1);
            await presale.connect(signers[4]).deposit(1);

            // check list
            const participants = await presale.getParticipants(0, 4);
            expect(await presale.participantCount()).to.be.equal(4);
            expect(participants.length).to.be.equal(4);
            expect(participants).to.eql([
                signers[0].address,
                signers[1].address,
                signers[2].address,
                signers[4].address,
            ]);
        });

        it("participants list - pagination", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            // private sale
            await presale.connect(signers[0]).depositPrivateSale(amount);
            await presale.connect(signers[1]).depositPrivateSale(amount);
            await presale.connect(signers[2]).depositPrivateSale(amount);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            await presale.connect(signers[3]).deposit(1);
            await presale.connect(signers[4]).deposit(1);

            // check list
            expect(await presale.getParticipants(1, 2)).to.be.eql([
                signers[2].address,
                signers[3].address
            ]);
            expect(await presale.getParticipants(1, 4)).to.be.eql([
                signers[4].address,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero
            ]);
        });
    });
});
