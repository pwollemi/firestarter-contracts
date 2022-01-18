import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { BigNumber } from "ethers";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

import { CustomToken, NftSale, Collection } from "../typechain";
import { advanceTimeAndBlock, getLatestBlockTimestamp } from "../helper/utils";
import { deployContract } from "../helper/deployer";

chai.use(solidity);
const { assert, expect } = chai;

const totalTokenSupply = ethers.utils.parseUnits("1000000000000", 18);
const ZERO = BigNumber.from("0");

const getNode = (address: string, alloc: number) => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      [address, alloc]
    )
  );
};

describe("Presale", () => {
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let fundToken: CustomToken;
  let nftSale: NftSale;
  let collection: Collection;

  before(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
  });

  beforeEach(async () => {
    fundToken = <CustomToken>(
      await deployContract("CustomToken", "Fund Token", "FT", totalTokenSupply)
    );
    collection = <Collection>await deployContract("Collection");
    await collection.initialize("NFT", "NFT");
  });

  describe("private sale", () => {
    const buyers: {
      address: string;
      alloc: number;
    }[] = [];
    let merkleRoot: string;
    let merkleTree: MerkleTree;

    it("initialize", async () => {
      for (let i = 1; i < 5; i++) {
        buyers[i - 1] = {
          address: signers[i].address,
          alloc: i,
        };
      }
      const leaves = buyers.map((el) => getNode(el.address, el.alloc));
      merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
      merkleRoot = merkleTree.getHexRoot();

      nftSale = <NftSale>await deployContract("NFTSale");

      const timestamp = await getLatestBlockTimestamp();
      await nftSale.initialize({
        collection: collection.address,
        fundToken: fundToken.address,
        startTime: timestamp + 10,
        endTime: timestamp + 1000,
        salePrice: ethers.utils.parseUnits("10"),
        globalCap: 0,
        merkleRoot,
        isPublic: false,
      });

      // pre-mint nft#1, nft#2
      await collection.connect(deployer).mint(nftSale.address, 1);
      await collection.connect(deployer).mint(nftSale.address, 2);

      const saleSetting = await nftSale.getSaleSetting();
      expect(saleSetting.collection).to.equal(collection.address);
      expect(saleSetting.fundToken).to.equal(fundToken.address);
      expect(saleSetting.startTime).to.equal(timestamp + 10);
      expect(saleSetting.endTime).to.equal(timestamp + 1000);
      expect(saleSetting.salePrice).to.equal(ethers.utils.parseUnits("10"));
      expect(saleSetting.globalCap).to.equal(ZERO);
      expect(saleSetting.merkleRoot).to.equal(merkleRoot);
      expect(saleSetting.isPublic).to.equal(false);
      expect(await collection.ownerOf(1)).to.equal(nftSale.address);
      expect(await collection.ownerOf(2)).to.equal(nftSale.address);
    });

    it("UpdateSaleSetting", async () => {
      // should update sale setting before startTime
      const timestamp = await getLatestBlockTimestamp();
      await nftSale.updateSaleSetting({
        collection: collection.address,
        fundToken: fundToken.address,
        startTime: timestamp + 10,
        endTime: timestamp + 1000,
        salePrice: ethers.utils.parseUnits("10"),
        globalCap: 0,
        merkleRoot: merkleRoot,
        isPublic: false,
      });

      const saleSetting = await nftSale.getSaleSetting();
      expect(saleSetting.collection).to.equal(collection.address);
      expect(saleSetting.fundToken).to.equal(fundToken.address);
      expect(saleSetting.startTime).to.equal(timestamp + 10);
      expect(saleSetting.endTime).to.equal(timestamp + 1000);
      expect(saleSetting.salePrice).to.equal(ethers.utils.parseUnits("10"));
      expect(saleSetting.globalCap).to.equal(ZERO);
      expect(saleSetting.merkleRoot).to.equal(merkleRoot);
      expect(saleSetting.isPublic).to.equal(false);

      await advanceTimeAndBlock(11);
      // update setting should be failed now
      await expect(
        nftSale.updateSaleSetting({
          collection: collection.address,
          fundToken: fundToken.address,
          startTime: timestamp + 10,
          endTime: timestamp + 1000,
          salePrice: ethers.utils.parseUnits("10"),
          globalCap: 0,
          merkleRoot: merkleRoot,
          isPublic: false,
        })
      ).to.be.revertedWith("");
    });

    it("buy", () => {
      it("buyPublic", async () => {
        const buyer1 = signers[1];
        await expect(nftSale.connect(buyer1).buyPublic(1)).to.be.revertedWith(
          ""
        );
      });

      it("buyPrivate", async () => {
        // buyer1 has 1 alloc
        const buyer1 = signers[1];
        const buyer1Proof = merkleTree.getHexProof(
          getNode(signers[1].address, 1)
        );
        await fundToken
          .connect(deployer)
          .transfer(buyer1.address, ethers.utils.parseUnits("1000"));
        await fundToken
          .connect(buyer1)
          .approve(nftSale.address, ethers.constants.MaxUint256);

        await nftSale.connect(buyer1).buyPrivate(1, 1, buyer1Proof);
        expect(await collection.ownerOf(1)).to.equal(buyer1.address);
        expect(await nftSale.getBalance(buyer1.address)).to.equal(1);

        // buyer1 already bought
        await expect(
          nftSale.connect(buyer1).buyPrivate(1, 1, buyer1Proof)
        ).to.be.revertedWith("");

        // buyer2 has 2 alloc
        const buyer2 = signers[2];
        const buyer2Proof = merkleTree.getHexProof(
          getNode(signers[2].address, 1)
        );
        await fundToken
          .connect(deployer)
          .transfer(buyer2.address, ethers.utils.parseUnits("1000"));
        await fundToken
          .connect(buyer2)
          .approve(nftSale.address, ethers.constants.MaxUint256);

        await nftSale.connect(buyer2).buyPrivate(1, 2, buyer2Proof);
        expect(await collection.ownerOf(2)).to.equal(buyer2.address);
        expect(await nftSale.getBalance(buyer2.address)).to.equal(1);
        // this mint nft#3
        await nftSale.connect(buyer2).buyPrivate(1, 2, buyer2Proof);
        expect(await collection.ownerOf(3)).to.equal(buyer2.address);
        expect(await nftSale.getBalance(buyer2.address)).to.equal(2);
      });
    });
  });

  describe("public sale", () => {
    it("initialize", async () => {
      nftSale = <NftSale>await deployContract("NFTSale");

      const timestamp = await getLatestBlockTimestamp();
      await nftSale.initialize({
        collection: collection.address,
        fundToken: fundToken.address,
        startTime: timestamp + 10,
        endTime: timestamp + 1000,
        salePrice: ethers.utils.parseUnits("10"),
        globalCap: 2,
        merkleRoot:
          "0xef20c827f5570915a479b1a6ccdf4ccaae654e9d202c8c646b378328dc3483b7",
        isPublic: true,
      });

      // pre-mint nft#1, nft#2
      await collection.connect(deployer).mint(nftSale.address, 1);
      await collection.connect(deployer).mint(nftSale.address, 2);

      const saleSetting = await nftSale.getSaleSetting();
      expect(saleSetting.collection).to.equal(collection.address);
      expect(saleSetting.fundToken).to.equal(fundToken.address);
      expect(saleSetting.startTime).to.equal(timestamp + 10);
      expect(saleSetting.endTime).to.equal(timestamp + 1000);
      expect(saleSetting.salePrice).to.equal(ethers.utils.parseUnits("10"));
      expect(saleSetting.globalCap).to.equal(BigNumber.from(2));
      expect(saleSetting.isPublic).to.equal(true);
      expect(await collection.ownerOf(1)).to.equal(nftSale.address);
      expect(await collection.ownerOf(2)).to.equal(nftSale.address);
    });

    it("buy", () => {
      it("buyPrivate", async () => {
        const buyer1 = signers[1];
        await expect(
          nftSale.connect(buyer1).buyPrivate(1, 1, [])
        ).to.be.revertedWith("");
      });

      it("buyPublic", async () => {
        // buyer1 has 1 alloc
        const buyer1 = signers[1];
        await fundToken
          .connect(deployer)
          .transfer(buyer1.address, ethers.utils.parseUnits("1000"));
        await fundToken
          .connect(buyer1)
          .approve(nftSale.address, ethers.constants.MaxUint256);

        // globalCap is 2
        await nftSale.connect(buyer1).buyPublic(2);
        expect(await collection.ownerOf(1)).to.equal(buyer1.address);
        expect(await nftSale.getBalance(buyer1.address)).to.equal(2);

        // buyer1 already bought
        await expect(nftSale.connect(buyer1).buyPublic(1)).to.be.revertedWith(
          ""
        );

        const buyer2 = signers[2];
        await fundToken
          .connect(deployer)
          .transfer(buyer2.address, ethers.utils.parseUnits("1000"));
        await fundToken
          .connect(buyer2)
          .approve(nftSale.address, ethers.constants.MaxUint256);
        // globalCap is 2
        // mint#3
        await nftSale.connect(buyer2).buyPublic(1);
        // mint#4
        await nftSale.connect(buyer2).buyPublic(1);
        expect(await collection.ownerOf(3)).to.equal(buyer2.address);
        expect(await collection.ownerOf(4)).to.equal(buyer2.address);
        expect(await nftSale.getBalance(buyer2.address)).to.equal(2);
      });
    });
  });
});
