import { MerkleTree } from "merkletreejs";
import { ethers } from "hardhat";
import keccak256 from "keccak256";

export interface UserData {
  wallet: string;
  isKycPassed: boolean;
  amount: number;
}

export const getNode = (userInfo: UserData) => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "bool", "uint256"],
      [userInfo.wallet, userInfo.isKycPassed, userInfo.amount]
    )
  );
};

export const generateTree = (userInfos: UserData[]) => {
  const leaves = userInfos.map((el) => getNode(el));

  return new MerkleTree(leaves, keccak256, { sort: true });
};
