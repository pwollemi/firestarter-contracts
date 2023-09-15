import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";
import MerkleTree from "merkletreejs";
import { CustomToken, CustomTokenFactory, MerkleWhitelist, Presale, PresaleFactory, Vesting, VestingFactory, Whitelist, WhitelistFactory } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployCampaign, deployProxy } from "../helper/deployer";
import { generateTree, getNode, UserData } from "../helper/merkle";

chai.use(solidity);
const { assert, expect } = chai;


const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);

describe('Presale', () => {
    let signers: SignerWithAddress[];
    let whitelist: MerkleWhitelist;
    let vesting: Vesting;
    let presale: Presale;
    let fundToken: CustomToken;
    let rewardToken: CustomToken;
    let vestingParams: any;
    let addresses: any;
    let presaleParams: any;
    let fakeUsers: UserData[] = [];
    let ACCURACY: BigNumber;

    let merkleTree: MerkleTree;
    const alloInfos: any = {};

    const closePeriod = 3600;

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
            vestingName: "Public Presale",
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
            initialRewardsAmount: totalTokenSupply.div(5), // 10k tokens will be deposited to vesting
            listTime: timestamp + 86400 * 9,
            refundPeriod: 86400
        };

        const project = await deployCampaign("contracts/Presale.sol:Presale", vestingParams, addresses, presaleParams);
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
            isKycPassed: true,
            publicMaxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: false,
            privateMaxAlloc: 0
          }));

        // add one user that hasn't passed KYC
        fakeUsers.push({
            wallet: signers[6].address,
            isKycPassed: false,
            publicMaxAlloc: totalTokenSupply.div(10000),
            allowedPrivateSale: false,
            privateMaxAlloc: 0
        });

        fakeUsers.forEach((el) => {
            alloInfos[el.wallet] = el;
        });
        
        merkleTree = generateTree(fakeUsers);
        await whitelist.setMerkleRoot(merkleTree.getHexRoot());

        ACCURACY = await presale.ACCURACY();
    });

    describe("initialize", async () => {
        it("Validiation of initilize params", async () => {
            const addressParams = {
                ...addresses,
                whitelist: whitelist.address,
                vesting: vesting.address
            };
            const now = await getLatestBlockTimestamp();
            await expect(deployProxy("contracts/Presale.sol:Presale", { ...addressParams, fundToken: ethers.constants.AddressZero }, presaleParams)).to.be.revertedWith("fund token address cannot be zero");
            await expect(deployProxy("contracts/Presale.sol:Presale", { ...addressParams, rewardToken: ethers.constants.AddressZero }, presaleParams)).to.be.revertedWith("reward token address cannot be zero");
            await expect(deployProxy("contracts/Presale.sol:Presale", { ...addressParams, projectOwner: ethers.constants.AddressZero }, presaleParams)).to.be.revertedWith("project owner address cannot be zero");
            await expect(deployProxy("contracts/Presale.sol:Presale", { ...addressParams, whitelist: ethers.constants.AddressZero }, presaleParams)).to.be.revertedWith("whitelisting contract address cannot be zero");
            await expect(deployProxy("contracts/Presale.sol:Presale", { ...addressParams, vesting: ethers.constants.AddressZero }, presaleParams)).to.be.revertedWith("init: vesting contract address cannot be zero");

            await expect(deployProxy("contracts/Presale.sol:Presale", addressParams, { ...presaleParams, startTime: now })).to.be.revertedWith("start time must be in the future");
            await expect(deployProxy("contracts/Presale.sol:Presale", addressParams, { ...presaleParams, rate: 0 })).to.be.revertedWith("exchange rate cannot be zero");
            await expect(deployProxy("contracts/Presale.sol:Presale", addressParams, { ...presaleParams, period: 0 })).to.be.revertedWith("presale period cannot be zero");
        });
    });
    
    describe("endPrivateSale", async () => {
        it("Only owners can do this operation", async () => {
            await expect(presale.connect(signers[2]).endPrivateSale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).endPrivateSale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).endPrivateSale()).to.be.revertedWith("Ownable: caller is not the owner");

            await presale.connect(signers[0]).endPrivateSale();
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
            await expect(presale.connect(signers[2]).setStartTime(startTime)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).setStartTime(startTime)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).setStartTime(startTime)).to.be.revertedWith("Ownable: caller is not the owner");

            await presale.connect(signers[0]).setStartTime(startTime);
        });

        it("Cannot set if private sale is over and presale alredy started", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await setNextBlockTimestamp(startTime + 10);
            await expect(presale.setStartTime(startTime + 100)).to.be.revertedWith("setStartTime: Presale already started");
        });

        it("Can set if private sale is over and presale is not started", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.setStartTime(startTime + 100);
        });

        it("Can't set if private sale is not over, though presale is already started", async () => {
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await setNextBlockTimestamp(startTime + 10);
            await expect(presale.setStartTime(startTime + 100)).to.be.revertedWith("setStartTime: Presale already started");
        });

        it("Must set future time", async () => {
            const startTime = await getLatestBlockTimestamp();
            await expect(presale.setStartTime(startTime)).to.be.revertedWith("setStartTime: Should be time in future");
        });

        // it("Must end private slae", async () => {
        //     const startTime = await getLatestBlockTimestamp() + 100;
        //     await presale.setStartTime(startTime);
        //     expect(await presale.isPrivateSaleOver()).to.be.equal(true);
        // });
        
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

            await expect(presale.connect(signers[2]).startPresale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).startPresale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).startPresale()).to.be.revertedWith("Ownable: caller is not the owner");

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

            await expect(presale.connect(signers[2]).pausePresaleByEmergency()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).pausePresaleByEmergency()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).pausePresaleByEmergency()).to.be.revertedWith("Ownable: caller is not the owner");
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

            await expect(presale.connect(signers[2]).resumePresale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).resumePresale()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).resumePresale()).to.be.revertedWith("Ownable: caller is not the owner");
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

        it("Ongoing auto start and end - should be true though private sale not ended", async () => {
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);

            await setNextBlockTimestamp(startTime);
            await mineBlock();
            expect(await presale.isPresaleGoing()).to.be.equal(true);

            await presale.endPrivateSale();
            expect(await presale.isPresaleGoing()).to.be.equal(true);

            // startTime is reset when ending private sale
            const newStartTime = await getLatestBlockTimestamp();
            await setNextBlockTimestamp(newStartTime + presaleParams.period + 1);
            await mineBlock();
            expect(await presale.isPresaleGoing()).to.be.equal(false);
        });

        it("Private sale ended, but not enough reward token deposited", async () => {
            expect(await presale.isPresaleGoing()).to.be.equal(false);
            await presale.endPrivateSale();
            expect(await presale.isPresaleGoing()).to.be.equal(false);

            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            expect(await presale.isPresaleGoing()).to.be.equal(true);
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
            const alloInfo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await expect(presale.deposit("1", alloInfo, proof)).to.be.revertedWith("Presale is not in progress");
        });

        it("Must be whitelisted user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            const fakeAllo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(fakeAllo));
            fakeAllo.wallet = signers[7].address;
            await expect(presale.connect(signers[7]).deposit("1", fakeAllo, proof)).to.be.revertedWith("Deposit: Not exist on the whitelist");
        });

        it("Must be the owner of leaf", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            const alloInfo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await expect(presale.connect(signers[7]).deposit("1", alloInfo, proof)).to.be.revertedWith("Deposit: Invalid alloInfo");
        });

        it("Must be kyc passed user", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            const alloInfo = alloInfos[signers[6].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await expect(presale.connect(signers[6]).deposit("1", alloInfo, proof)).to.be.revertedWith("Deposit: Not passed KYC");
        });

        it("Can't exceed publicMaxAlloc", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await expect(presale.connect(signers[1]).deposit(BigNumber.from(fakeUsers[1].publicMaxAlloc).add(1), alloInfo, proof)).to.be.revertedWith("Deposit: Can't exceed the publicMaxAlloc!");

            // but succeeds with max allocation
            await presale.connect(signers[1]).deposit(fakeUsers[1].publicMaxAlloc, alloInfo, proof);
        });

        it("Deposit updates correct states", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo, proof);

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

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));

            // 1st
            const depositAmount1 = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            const rewardAmount1 = depositAmount1.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount1, alloInfo, proof);

            const recpInfo1 = await presale.recipients(signers[1].address);
            expect(recpInfo1.ftBalance).to.be.equal(depositAmount1);
            expect(recpInfo1.rtBalance).to.be.equal(rewardAmount1);

            expect(await presale.publicSoldAmount()).to.be.equal(rewardAmount1);

            const vestInfo1 = await vesting.recipients(signers[1].address);
            expect(vestInfo1.totalAmount).to.be.equal(rewardAmount1);

            // 2nd
            const depositAmount2 = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            const rewardAmount2 = depositAmount2.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).deposit(depositAmount2, alloInfo, proof);

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

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            const nextTimestamp = await getLatestBlockTimestamp() + 10;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.connect(signers[1]).deposit(depositAmount, alloInfo, proof))
                .to.emit(presale, "Vested")
                .withArgs(signers[1].address, rewardAmount, false, nextTimestamp);
        });

        it("Deposit in fill period", async () => { 
            const alloInfo = {
                wallet: signers[1].address,
                isKycPassed: true,
                publicMaxAlloc: totalTokenSupply.div(10000),
                allowedPrivateSale: false,
                privateMaxAlloc: totalTokenSupply.div(10000)
              };
    
            const merkleTree1 = generateTree([alloInfo]);
            const proof = merkleTree1.getHexProof(getNode(alloInfo));
            await whitelist.setMerkleRoot(merkleTree1.getHexRoot());

            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            const endTime = startTime + presaleParams.period;
            await presale.setStartTime(startTime);
            await setNextBlockTimestamp(startTime);

            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            await expect(presale.connect(signers[1]).deposit(depositAmount, alloInfo, proof)).to.be.revertedWith("Deposit: Must be in fill period for private participants to buy in public");

            await setNextBlockTimestamp(endTime - closePeriod + 1);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo, proof);
            const recpInfo = await presale.recipients(signers[1].address);
            expect(recpInfo.ftBalance).to.be.equal(depositAmount);
            expect(recpInfo.rtBalance).to.be.equal(rewardAmount);

            expect(await presale.publicSoldAmount()).to.be.equal(rewardAmount);

            const vestInfo = await vesting.recipients(signers[1].address);
            expect(vestInfo.totalAmount).to.be.equal(rewardAmount);
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
            await presale.withdrawUnsoldToken();

            await expect(presale.connect(signers[2]).startVesting()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).startVesting()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).startVesting()).to.be.revertedWith("Ownable: caller is not the owner");
            await presale.startVesting();
        });

        it("Can only be called when finished and unsold token is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            await expect(presale.startVesting()).to.be.revertedWith("Presale has not been ended yet!");
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await expect(presale.startVesting()).to.be.revertedWith("startVesting: can only start vesting after withdrawing unsold tokens");

            await presale.withdrawUnsoldToken();
            await presale.startVesting();
        });

        it("Vesting starts correctly", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.withdrawUnsoldToken();
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
            await expect(presale.connect(signers[2]).withdrawFunds(treasury)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).withdrawFunds(treasury)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).withdrawFunds(treasury)).to.be.revertedWith("Ownable: caller is not the owner");
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

        it("Cannot withdraw to zero address", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await expect(presale.withdrawFunds(ethers.constants.AddressZero)).to.be.revertedWith("withdraw: Treasury can't be zero address");
        });

        it("Correct amount is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            const totalAmount = depositAmount.mul(4);           
            const feeAmount = totalAmount.mul(presaleParams.serviceFee).div(ACCURACY);

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

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            const totalAmount = depositAmount.mul(4);
            const feeAmount = totalAmount.mul(presaleParams.serviceFee).div(ACCURACY);

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

    describe("Redeem funds", async () => {
        it("Can only be called when finished", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Presale has not been ended yet!");
        });

        it("Can only be called in list period", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Not listed yet");
            await setNextBlockTimestamp(presaleParams.listTime + presaleParams.refundPeriod + 1);
            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Refund period ended");
        });

        it("Redeem works; Cannot be redeemed again", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Not listed yet");
            await setNextBlockTimestamp(presaleParams.listTime + 1);

            const fundBalance0 = await fundToken.balanceOf(signers[1].address);
            const vestingInfo0 = await vesting.recipients(signers[1].address);
            const rewardBalance0 = await rewardToken.balanceOf(signers[2].address);
            await presale.connect(signers[1]).redeemFunds();
            const fundBalance1 = await fundToken.balanceOf(signers[1].address);
            const rewardBalance1 = await rewardToken.balanceOf(signers[2].address);
            const vestingInfo1 = await vesting.recipients(signers[1].address);

            expect(fundBalance1.sub(fundBalance0)).to.be.equal(depositAmount);
            expect(vestingInfo1.totalAmount).to.be.equal(0);
            expect(rewardBalance1.sub(rewardBalance0)).to.be.equal(vestingInfo0.totalAmount);

            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Already redeemed");
        });

        it("Can't refund if already withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + 1);

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Not listed yet");
            await setNextBlockTimestamp(presaleParams.listTime + 1);

            await presale.withdrawUnsoldToken();
            await presale.startVesting();
            await setNextBlockTimestamp(presaleParams.listTime + 43200);
            await vesting.connect(signers[1]).withdraw();

            const vestingInfo0 = await vesting.recipients(signers[1].address);
            expect(vestingInfo0.amountWithdrawn).to.be.gt(0);

            await expect(presale.connect(signers[1]).redeemFunds()).to.be.revertedWith("Already withdrawn");
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

            await expect(presale.connect(signers[2]).withdrawUnsoldToken()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[3]).withdrawUnsoldToken()).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(presale.connect(signers[4]).withdrawUnsoldToken()).to.be.revertedWith("Ownable: caller is not the owner");
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

        it("Set unsoldTokenWithdrawnFlag to true", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            expect(await presale.unsoldTokenWithdrawn()).to.be.equal(false);
            await presale.withdrawUnsoldToken();
            expect(await presale.unsoldTokenWithdrawn()).to.be.equal(true);
        });

        it("Correct amount is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);


            const totalAmount = depositAmount.mul(4);
            const soldAmount = totalAmount.mul(ACCURACY).div(presaleParams.rate);
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

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);


            const totalAmount = depositAmount.mul(4);
            const soldAmount = totalAmount.mul(ACCURACY).div(presaleParams.rate);
            const unsoldAmount = presaleParams.initialRewardsAmount.sub(soldAmount);
            
            const withdrawTime = startTime + presaleParams.period + 1;
            await setNextBlockTimestamp(withdrawTime);
            await expect(presale.withdrawUnsoldToken())
                .to.emit(presale, "WithdrawUnsoldToken")
                .withArgs(addresses.projectOwner, unsoldAmount, withdrawTime);
        });
    });

    describe("Withdraw Unsold tokens, Funds and start Vesting", async () => {
        it("Correct amount is withdrawn", async () => {
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();

            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            const depositAmount = BigNumber.from(fakeUsers[1].publicMaxAlloc).div(2);
            await presale.connect(signers[1]).deposit(depositAmount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).deposit(depositAmount, alloInfo2, proof2);
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(depositAmount, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(depositAmount, alloInfo4, proof4);


            const treasury = signers[9].address;
            const totalAmount = depositAmount.mul(4);
            const soldAmount = totalAmount.mul(ACCURACY).div(presaleParams.rate);
            const unsoldAmount = presaleParams.initialRewardsAmount.sub(soldAmount);
            const feeAmount = totalAmount.mul(presaleParams.serviceFee).div(ACCURACY);
            
            const ownerRewardBalance0 = await rewardToken.balanceOf(addresses.projectOwner);
            const ownerFundBalance0 = await fundToken.balanceOf(addresses.projectOwner);
            const feeBalance0 = await fundToken.balanceOf(treasury);

            await setNextBlockTimestamp(startTime + presaleParams.period + 1);
            await presale.processFundsAndStartVestingImmediately(treasury);

            const ownerRewardBalance1 = await rewardToken.balanceOf(addresses.projectOwner);
            const ownerFundBalance1 = await fundToken.balanceOf(addresses.projectOwner);
            const feeBalance1 = await fundToken.balanceOf(treasury);

            expect(ownerRewardBalance1.sub(ownerRewardBalance0)).to.be.equal(unsoldAmount);
            expect(ownerFundBalance1.sub(ownerFundBalance0)).to.be.equal(totalAmount.sub(feeAmount));
            expect(feeBalance1.sub(feeBalance0)).to.be.equal(feeAmount);            
        });
    });
});
