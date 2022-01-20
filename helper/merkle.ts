import { MerkleTree } from "merkletreejs";
import { ethers } from "hardhat";
import keccak256 from "keccak256";
import { BigNumberish } from "ethers";

export interface UserData {
  wallet: string;
  isKycPassed: boolean;
  publicMaxAlloc: BigNumberish;
  allowedPrivateSale: boolean;
  privateMaxAlloc: BigNumberish;
}

export const getNode = (userInfo: UserData): string => ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "bool", "uint256", "bool", "uint256"],
      [userInfo.wallet, userInfo.isKycPassed, userInfo.publicMaxAlloc, userInfo.allowedPrivateSale, userInfo.privateMaxAlloc]
    )
  );

export const generateTree = (userInfos: UserData[]): MerkleTree => {
  const leaves = userInfos.map((el) => getNode(el));

  return new MerkleTree(leaves, keccak256, { sort: true });
};
