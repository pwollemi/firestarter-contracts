import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { MerkleTree } from "merkletreejs";

import { MerkleWhitelist } from "../typechain";
import { deployProxy } from "../helper/deployer";
import { generateTree, getNode, UserData } from "../helper/merkle";

chai.use(solidity);
const { assert, expect } = chai;

describe("MerkleWhitelist", () => {
  let signers: SignerWithAddress[];
  let worker: SignerWithAddress;
  let deployer: SignerWithAddress;
  let userInfos: UserData[] = [];

  let whitelist: MerkleWhitelist;
  let merkleTree: MerkleTree;
  let root: string;

  before(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];
    worker = signers[1];

    userInfos = signers.map((signer, i) => ({
      wallet: signer.address,
      isKycPassed: i % 2 === 0,
      amount: i + 1,
    }));

    merkleTree = generateTree(userInfos);
    root = merkleTree.getHexRoot();

    whitelist = await deployProxy("MerkleWhitelist");
  });

  describe("Access control", () => {
    describe("setWorker", () => {
      it("non-owner can't set the worker", async () => {
        await expect(
          whitelist.connect(signers[2]).setWorker(worker.address)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
      it("owner can set the worker", async () => {
        await whitelist.connect(deployer).setWorker(worker.address);
        expect(await whitelist.worker()).to.equal(worker.address);
      });
    });

    describe("setRoot", () => {
      it("non-owner can't set the root", async () => {
        await expect(
          whitelist.connect(signers[2]).setMerkleRoot(root)
        ).to.be.revertedWith(
          "Whitelist: caller is not the owner nor the worker"
        );
      });
      it("owner can set the root", async () => {
        await whitelist.connect(deployer).setMerkleRoot(root);
        await whitelist.connect(worker).setMerkleRoot(root);
        expect(await whitelist.root()).to.equal(root);
      });
    });
  });

  describe("Verify userInfos", () => {
    it("should be verified all user infos", async () => {
      for (let i = 0; i < userInfos.length; i++) {
        const node = getNode(userInfos[i]);
        const proof = merkleTree.getHexProof(node);

        expect(
          await whitelist.verify(
            userInfos[i].wallet,
            userInfos[i].isKycPassed,
            userInfos[i].amount,
            proof
          )
        ).to.equal(true);

        expect(
          await whitelist.verify(
            userInfos[i].wallet,
            !userInfos[i].isKycPassed,
            userInfos[i].amount,
            proof
          )
        ).to.equal(false);
      }
    });
  });
});
