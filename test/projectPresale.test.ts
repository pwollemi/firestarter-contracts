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
            initalUnlock: 2000000000, // 20%
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
            initalRewardsAmount: totalTokenSupply.div(5) // 10k tokens will be deposited to vesting
        };

        const project = await deployCampaign("ProjectPresale", initialOwners, vestingParams, addresses, presaleParams);
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
            isKycPassed: i % 2 === 0,
            maxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: true,
            privateMaxAlloc: totalTokenSupply.div(2000)
          }));
        fakeUsers[3].allowedPrivateSale = false;
        fakeUsers[4].allowedPrivateSale = false;
        await whitelist.addToWhitelist(fakeUsers);

        accuracy = await presale.accuracy();
    });

    describe("Deposit PrivateSale", async () => {
        it("Can do this only when enough amount is deposited", async () => {
            await expect(presale.depositPrivateSale(1)).to.be.revertedWith("Deposit enough rewardToken tokens to the vesting contract first!");
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);
            await presale.depositPrivateSale(1);
        });

        it("Can't deposit if private sale is over", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);
            await presale.depositPrivateSale(1);
            await presale.endPrivateSale();
            await expect(presale.depositPrivateSale(1)).to.be.revertedWith("depositPrivateSale: Private Sale is ended!");
        });

        it("Must be whitelisted user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);
            await expect(presale.connect(signers[7]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not exist on the whitelist");
        });

        it("Must be private sale allowed user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);
            await expect(presale.connect(signers[3]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");
            await expect(presale.connect(signers[4]).depositPrivateSale("1")).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");
        });

        it("Can't exceed maxAlloc", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);
            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc).add(1);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount)).to.be.revertedWith("Deposit: Can't exceed the maxAlloc!");
        });

        it("Deposit updates correct states", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount);

            const expRwdBalance = depositAmount.mul(accuracy).div(presaleParams.rate);
            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(depositAmount);
            expect(recpInfo.rtBalance).to.be.equal(expRwdBalance);

            expect(await presale.privateSoldAmount()).to.be.equal(expRwdBalance);
            expect(await presale.privateSold(signers[1].address)).to.be.equal(expRwdBalance);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(expRwdBalance);
        });

        it("Can deposit full allocation amount in private and public sale", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);

            const depositAmount1 = fakeUsers[1].maxAlloc;
            const depositAmount2 = BigNumber.from(fakeUsers[1].privateMaxAlloc);

            await presale.connect(signers[1]).depositPrivateSale(depositAmount1);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.connect(signers[1]).deposit(depositAmount2);

            const totalAmount = depositAmount1.add(depositAmount2);
            const totalRwdAmount = totalAmount.mul(accuracy).div(presaleParams.rate);
            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(totalAmount);
            expect(recpInfo.rtBalance).to.be.equal(totalRwdAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(totalRwdAmount);
        });

        it("deposit amount is stacked", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);

            // 1st
            const depositAmount1 = fakeUsers[1].maxAlloc.div(2);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount1);

            const expRwdBalance1 = depositAmount1.mul(accuracy).div(presaleParams.rate);
            const recpInfo1 = await presale.recipients(signers[1].address);
            expect(recpInfo1.ftBalance).to.be.equal(depositAmount1);
            expect(recpInfo1.rtBalance).to.be.equal(expRwdBalance1);

            expect(await presale.privateSoldAmount()).to.be.equal(expRwdBalance1);
            expect(await presale.privateSold(signers[1].address)).to.be.equal(expRwdBalance1);

            const vestInfo1 = await vesting.recipients(signers[1].address);
            expect(vestInfo1.totalAmount).to.be.equal(expRwdBalance1);

            // 2nd
            const depositAmount2 = fakeUsers[1].maxAlloc.div(4);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount2);

            const expRwdBalance2 = depositAmount2.mul(accuracy).div(presaleParams.rate);
            const recpInfo2 = await presale.recipients(signers[1].address);
            expect(recpInfo2.ftBalance).to.be.equal(depositAmount1.add(depositAmount2));
            expect(recpInfo2.rtBalance).to.be.equal(expRwdBalance1.add(expRwdBalance2));

            expect(await presale.privateSoldAmount()).to.be.equal(expRwdBalance1.add(expRwdBalance2));
            expect(await presale.privateSold(signers[1].address)).to.be.equal(expRwdBalance1.add(expRwdBalance2));

            const vestInfo2 = await vesting.recipients(signers[1].address);
            expect(vestInfo2.totalAmount).to.be.equal(expRwdBalance1.add(expRwdBalance2));
        });

        it("Vested event is emitted with correct params", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initalRewardsAmount);

            const depositAmount = fakeUsers[1].maxAlloc.div(2);
            const expRwdBalance = depositAmount.mul(accuracy).div(presaleParams.rate);
            const nextTimestamp = await getLatestBlockTimestamp() + 10;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount))
                .to.emit(presale, "Vested")
                .withArgs(signers[1].address, expRwdBalance, nextTimestamp);
        });
    });
});
