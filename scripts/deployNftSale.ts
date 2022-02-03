import { ethers } from "hardhat";
import { CustomToken, NftSale, Collection } from "../typechain";
import { deployContract, verifyContract } from "../helper/deployer";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

const getNode = (address: string, alloc: number) => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ["address", "uint256"],
      [address, alloc]
    )
  );
};

async function main() {
  const totalTokenSupply = ethers.utils.parseUnits("1000000000000");

  let fundToken = <CustomToken>(
    await deployContract("CustomToken", "Fund Token", "FT", totalTokenSupply)
  );

  console.log("fundToken", fundToken.address);

  let collection = <Collection>await deployContract("Collection");
  await collection.initialize("NFT", "NFT");
  console.log("collection", collection.address);

  let nftSale = <NftSale>await deployContract("NFTSale");
  console.log("nftSale", nftSale.address);

  let buyers = [
    {
      address: "0x0381B81BD78929Cd424730df91650e907d87496E",
      alloc: 10,
    },
    {
      address: "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
      alloc: 10,
    },
  ];

  const leaves = buyers.map((el) => getNode(el.address, el.alloc));
  const merkleTree = new MerkleTree(leaves, keccak256, { sort: true });
  const merkleRoot = merkleTree.getHexRoot();

  await nftSale.initialize({
    collection: collection.address,
    fundToken: fundToken.address,
    startTime: Math.floor(Date.now() / 1000) + 100,
    endTime: Math.floor(Date.now() / 1000) + 3600 * 2,
    salePrice: ethers.utils.parseUnits("10"),
    userCap: 0,
    globalCap: 100,
    merkleRoot,
    isPublic: false,
  });

  await collection.setMinter(nftSale.address);

  await fundToken.transfer(
    "0x0381B81BD78929Cd424730df91650e907d87496E",
    ethers.utils.parseEther("1000000")
  );
  await fundToken.transfer(
    "0x4FB2bb19Df86feF113b2016E051898065f963CC5",
    ethers.utils.parseEther("1000000")
  );

  try {
    await verifyContract(nftSale.address);
  } catch (e) {}
  try {
    await verifyContract(collection.address);
  } catch (e) {}
  try {
    await verifyContract(
      fundToken.address,
      "Fund Token",
      "FT",
      totalTokenSupply
    );
  } catch (e) {}
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
