import { FirestarterPresale } from "./../typechain/FirestarterPresale.d";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const proxyAdminABI = [
  {
    inputs: [
      {
        internalType: "contract TransparentUpgradeableProxy",
        name: "proxy",
        type: "address",
      },
    ],
    name: "getProxyAdmin",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "contract TransparentUpgradeableProxy",
        name: "proxy",
        type: "address",
      },
    ],
    name: "getProxyImplementation",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];
interface Addresses {
  [name: string]: string;
}

async function main() {
  const addresses: Addresses = {
    ProxyAdmin: "0xDC0dB45dC048fBA6047422D8913E6C701D0e3A32",
    Gnosis: "0x67B6Bef9516f71B1797F32F853460f150519824b",
    FirestarterPresale: "0x1d7942657F077C77CA4539317fFA5b6b5274fa51",
    Vesting: "0xC1AC8068461410002206210DF6172589627F2351",
    Whitelist: "0x13a55399852Bc18Ed359e3ecf5E180C1b9A0AF77",
  };

  const proxyAdmin = await ethers.getContractAt(
    proxyAdminABI,
    addresses.ProxyAdmin
  );

  const proxyAdminOwner = await proxyAdmin.owner();
  if (proxyAdminOwner == addresses.Gnosis) {
    console.log(`PASSED proxyAdmin Owner is same as Gnosis wallet`);
  } else {
    console.error(`FAILED proxyAdmin Owner is not same as Gnosis wallet`);
  }

  for (const contractName of ["FirestarterPresale", "Vesting", "Whitelist"]) {
    const address = addresses[contractName];
    const factory = await ethers.getContractFactory(contractName);
    const contract = await factory.attach(address);
    const owner = await contract.owner();

    if (owner == addresses.Gnosis && contractName !== "Vesting") {
      console.log(`PASSED ${contractName} Owner is same as Gnosis wallet`);
    } else if (
      owner == addresses.FirestarterPresale &&
      contractName == "Vesting"
    ) {
      console.log(`PASSED ${contractName} Owner is same as Presale contract`);
    } else {
      console.log(owner);
      if (contractName !== "Vesting") {
        console.error(
          `FAILED ${contractName} Owner is not same as Gnosis wallet`
        );
      } else {
        console.error(
          `FAILED ${contractName} Owner is not same as Presale wallet`
        );
      }
    }

    const proxyAdminAddress = await proxyAdmin.getProxyAdmin(address);
    if (proxyAdminAddress == addresses.ProxyAdmin) {
      console.log(`PASSED ${contractName} proxyAdmin is same as ProxyAdmin`);
    } else {
      console.error(
        `FAILED ${contractName} proxyAdmin is not the same as ProxyAdmin`
      );
    }

    const implementation = await proxyAdmin.getProxyImplementation(address);
    const byteCode = await ethers.provider.getCode(implementation);
    const fileContent = fs
      .readFileSync(
        path.resolve(
          __dirname,
          `../artifacts/contracts/${contractName}.sol/${contractName}.json`
        )
      )
      .toString();
    const contractArtifact = JSON.parse(fileContent);

    if (byteCode == contractArtifact.deployedBytecode) {
      console.log(
        `PASSED ${contractName} has correct deployed contract bytecode`
      );
    } else {
      console.error(
        `FAILED ${contractName} doesn't have correct deployed contract bytecode`
      );
    }
  }

  //   const contract = await attachContract("CustomToken", data.fUSDCAddress);
  //   const flameToken = await attachContract("CustomToken", data.FLAMEAddress);

  //   for (const user of users) {
  //     const balance = await flameToken.balanceOf(user);
  //     console.log(`Wallet ${user} has ${balance} Flame tokens`);
  //   }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
