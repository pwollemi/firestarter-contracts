import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from 'chai';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber, BigNumberish } from "ethers";
import MerkleTree from "merkletreejs";
import { CustomToken, MerkleWhitelist, ProjectPresale, Vesting, Whitelist } from "../typechain";
import { setNextBlockTimestamp, getLatestBlockTimestamp, mineBlock } from "../helper/utils";
import { deployContract, deployCampaign } from "../helper/deployer";
import { generateTree, getNode } from "../helper/merkle";

chai.use(solidity);
const { expect } = chai;

describe('Project Presale', () => {
    const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);

    let signers: SignerWithAddress[];
    let whitelist: MerkleWhitelist;
    let vesting: Vesting;
    let presale: ProjectPresale;
    let fundToken: CustomToken;
    let rewardToken: CustomToken;
    let vestingParams: any;
    let addresses: any;
    let presaleParams: any;
    let fakeUsers: { wallet: string; isKycPassed: boolean; publicMaxAlloc: BigNumber; allowedPrivateSale: boolean, privateMaxAlloc: BigNumberish;}[] = [];
    let ACCURACY: BigNumber;

    let merkleTree: MerkleTree;
    const alloInfos: any = {};

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

        const project = await deployCampaign("contracts/ProjectPresale.sol:ProjectPresale", vestingParams, addresses, presaleParams);
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

        fakeUsers.forEach((el) => {
            alloInfos[el.wallet] = el;
        });
        
        merkleTree = generateTree(fakeUsers);
        await whitelist.setMerkleRoot(merkleTree.getHexRoot());        

        ACCURACY = await presale.ACCURACY();
    });

    describe("Deposit PrivateSale", async () => {
        it("Can do this only when enough amount is deposited", async () => {
            const alloInfo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await expect(presale.depositPrivateSale(1, alloInfo, proof)).to.be.revertedWith("Deposit enough rewardToken tokens to the vesting contract first!");
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(1, alloInfo, proof);
        });

        it("Can't deposit if private sale is over", async () => {
            const alloInfo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await presale.depositPrivateSale(1, alloInfo, proof);
            await presale.endPrivateSale();
            await expect(presale.depositPrivateSale(1, alloInfo, proof)).to.be.revertedWith("depositPrivateSale: Private Sale is ended!");
        });

        it("Must be whitelisted user", async () => { 
            const fakeAllo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(fakeAllo));
            fakeAllo.wallet = signers[7].address;
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[7]).depositPrivateSale("1", fakeAllo, proof)).to.be.revertedWith("depositPrivateSale: Not exist on the whitelist");
        });

        it("Must be owner of the leaf", async () => { 
            const alloInfo = alloInfos[signers[0].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[7]).depositPrivateSale("1", alloInfo, proof)).to.be.revertedWith("depositPrivateSale: Invalid alloInfo");
        });

        it("Must be kyc passed user", async () => { 
            const alloInfo = alloInfos[signers[6].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[6]).depositPrivateSale("1", alloInfo, proof)).to.be.revertedWith("depositPrivateSale: Not passed KYC");
        });

        it("Must be private sale allowed user", async () => { 
            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            await expect(presale.connect(signers[3]).depositPrivateSale("1", alloInfo3, proof3)).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");

            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await expect(presale.connect(signers[4]).depositPrivateSale("1", alloInfo4, proof4)).to.be.revertedWith("depositPrivateSale: Not allowed to participate in private sale");
        });

        it("Can't exceed publicMaxAlloc", async () => { 
            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);
            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount.add(1), alloInfo, proof)).to.be.revertedWith("Deposit: Can't exceed the privateMaxAlloc!");

            // but succeeds with max allocation
            await presale.connect(signers[1]).depositPrivateSale(depositAmount, alloInfo, proof);
        });

        it("Deposit updates correct states", async () => { 
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount, alloInfo, proof);

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

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            const depositAmount1 = BigNumber.from(fakeUsers[1].privateMaxAlloc);
            const depositAmount2 = fakeUsers[1].publicMaxAlloc;
            const rewardAmount1 = depositAmount1.mul(ACCURACY).div(presaleParams.rate);
            const rewardAmount2 = depositAmount2.mul(ACCURACY).div(presaleParams.rate);

            await presale.connect(signers[1]).depositPrivateSale(depositAmount1, alloInfo, proof);
            await presale.endPrivateSale();
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.startPresale();
            await presale.connect(signers[1]).deposit(depositAmount2, alloInfo, proof);

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

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));

            // 1st
            const depositAmount1 = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount1 = depositAmount1.mul(ACCURACY).div(presaleParams.rate);
            await presale.connect(signers[1]).depositPrivateSale(depositAmount1, alloInfo, proof);

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
            await presale.connect(signers[1]).depositPrivateSale(depositAmount2, alloInfo, proof);

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

            const alloInfo = alloInfos[signers[1].address];
            const proof = merkleTree.getHexProof(getNode(alloInfo));
            const depositAmount = BigNumber.from(fakeUsers[1].privateMaxAlloc).div(2);
            const rewardAmount = depositAmount.mul(ACCURACY).div(presaleParams.rate);
            const nextTimestamp = await getLatestBlockTimestamp() + 10;
            await setNextBlockTimestamp(nextTimestamp);
            await expect(presale.connect(signers[1]).depositPrivateSale(depositAmount, alloInfo, proof))
                .to.emit(presale, "Vested")
                .withArgs(signers[1].address, rewardAmount, true, nextTimestamp);
        });
    });

    describe("analysis support", () => {
        it("participants list - private and public", async () => {
            const amount = ethers.utils.parseUnits("1", 18);
            await rewardToken.transfer(vesting.address, presaleParams.initialRewardsAmount);

            // private sale
            const alloInfo0 = alloInfos[signers[0].address];
            const proof0 = merkleTree.getHexProof(getNode(alloInfo0));
            await presale.connect(signers[0]).depositPrivateSale(amount, alloInfo0, proof0);
            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            await presale.connect(signers[1]).depositPrivateSale(amount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).depositPrivateSale(amount, alloInfo2, proof2);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(1, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(1, alloInfo4, proof4);

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
            const alloInfo0 = alloInfos[signers[0].address];
            const proof0 = merkleTree.getHexProof(getNode(alloInfo0));
            await presale.connect(signers[0]).depositPrivateSale(amount, alloInfo0, proof0);
            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            await presale.connect(signers[1]).depositPrivateSale(amount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).depositPrivateSale(amount, alloInfo2, proof2);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[1]).deposit(1, alloInfo1, proof1);
            await presale.connect(signers[2]).deposit(1, alloInfo2, proof2);
            await presale.connect(signers[4]).deposit(1, alloInfo4, proof4);
            await presale.connect(signers[1]).deposit(1, alloInfo1, proof1);
            await presale.connect(signers[4]).deposit(1, alloInfo4, proof4);

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
            const alloInfo0 = alloInfos[signers[0].address];
            const proof0 = merkleTree.getHexProof(getNode(alloInfo0));
            await presale.connect(signers[0]).depositPrivateSale(amount, alloInfo0, proof0);
            const alloInfo1 = alloInfos[signers[1].address];
            const proof1 = merkleTree.getHexProof(getNode(alloInfo1));
            await presale.connect(signers[1]).depositPrivateSale(amount, alloInfo1, proof1);
            const alloInfo2 = alloInfos[signers[2].address];
            const proof2 = merkleTree.getHexProof(getNode(alloInfo2));
            await presale.connect(signers[2]).depositPrivateSale(amount, alloInfo2, proof2);

            // public sale
            const startTime = await getLatestBlockTimestamp() + 10000;
            await presale.setStartTime(startTime);
            await presale.endPrivateSale();
            await presale.startPresale();

            const alloInfo3 = alloInfos[signers[3].address];
            const proof3 = merkleTree.getHexProof(getNode(alloInfo3));
            await presale.connect(signers[3]).deposit(1, alloInfo3, proof3);
            const alloInfo4 = alloInfos[signers[4].address];
            const proof4 = merkleTree.getHexProof(getNode(alloInfo4));
            await presale.connect(signers[4]).deposit(1, alloInfo4, proof4);

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
