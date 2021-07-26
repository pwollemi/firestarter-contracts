import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";
import { CustomToken, CustomTokenFactory, FirestarterPresale, FirestarterPresaleFactory, Presale, PresaleFactory, Vesting, VestingFactory, Whitelist, WhitelistFactory } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployCampaign } from "../helper/deployer";

chai.use(solidity);
const { assert, expect } = chai;

describe('Firestarter Presale', () => {
    const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);

    let signers: SignerWithAddress[];
    let whitelist: Whitelist;
    let vesting: Vesting;
    let presale: FirestarterPresale;
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

        const project = await deployCampaign("FirestarterPresale", initialOwners, vestingParams, addresses, presaleParams);
        whitelist = project.whitelist;
        vesting = project.vesting;
        presale = <FirestarterPresale>project.presale;

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

    describe("depositPrivateSale", async () => {
        it("Only owners can do this operation", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            await expect(presale.connect(signers[2]).depositPrivateSale(signers[2].address, 1)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[3]).depositPrivateSale(signers[2].address, 1)).to.be.revertedWith("Requires Owner Role");
            await expect(presale.connect(signers[4]).depositPrivateSale(signers[2].address, 1)).to.be.revertedWith("Requires Owner Role");

            await presale.connect(signers[0]).depositPrivateSale(signers[2].address, 1);
            await presale.connect(signers[1]).depositPrivateSale(signers[2].address, 1);
        });

        it("Can do this only when enough amount is deposited", async () => {
            await expect(presale.depositPrivateSale(signers[2].address, 1)).to.be.revertedWith("Deposit enough rewardToken tokens to the vesting contract first!");
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(signers[2].address, 1);
        });

        it("Can't deposit if private sale is over", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(signers[2].address, 1);
            await presale.endPrivateSale();
            await expect(presale.depositPrivateSale(signers[2].address, 1)).to.be.revertedWith("depositPrivateSale: Private Sale is ended!");
        });

        it("Recipient info is updated", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(signers[2].address, amount);
            const recpInfo = await presale.recipients(signers[2].address);
            const vestInfo = await vesting.recipients(signers[2].address);
            expect(recpInfo.rtBalance).to.be.equal(amount);
            expect(vestInfo.totalAmount).to.be.equal(amount);
        });

        it("Can deposit full allocation amount in private and public sale", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            const rewardAmount = fakeUsers[1].maxAlloc;
            const depositAmount = rewardAmount.mul(presaleParams.rate).div(accuracy);

            // deposit public max allocation amount in private sale
            await presale.depositPrivateSale(signers[1].address, rewardAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            // deposit public max allocation amount in public sale
            await presale.connect(signers[1]).deposit(depositAmount);

            const totalRwdAmount = rewardAmount.mul(2);
            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(depositAmount); // deposited amount only in public sale
            expect(recpInfo.rtBalance).to.be.equal(totalRwdAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(totalRwdAmount);
        });

        it("Vested event is emmitted with correct params", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            const nextTimestamp = await getLatestBlockTimestamp() + 100;
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.depositPrivateSale(signers[2].address, amount))
                .to.emit(presale, "Vested")
                .withArgs(signers[2].address, amount, true, nextTimestamp);
        });
    });

});
