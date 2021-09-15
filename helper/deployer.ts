import { Contract } from "ethers";
import hre, { ethers, upgrades } from "hardhat";
import { FirestarterPresale, Presale, ProjectPresale, Vesting, Whitelist, } from "../typechain";

declare type ContractName = "CustomToken" | "Whitelist" | "Vesting" | "TokenLock" | "FirestarterPresale" | "ProjectPresale" | "Presale" | "Staking"
declare type CampaignType = "FirestarterPresale" | "ProjectPresale" | "Presale";

async function verifyContract(address: string, ...constructorArguments: any[]) : Promise<void> {
    await hre.run("verify:verify", {
        address,
        constructorArguments
    });
}

async function deployContract(name: ContractName, ...constructorArgs: any[]) : Promise<any> {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy(...constructorArgs);
    await contract.deployed();
    return contract;
}

async function deployProxy(name: ContractName, ...constructorArgs: any[]) : Promise<any> {
    const factory = await ethers.getContractFactory(name);
    const contract = await upgrades.deployProxy(factory, constructorArgs);
    await contract.deployed();
    return contract;
}

async function deployCampaign(type: CampaignType, vestingParams = {}, addresses: any, presaleParams: any): Promise<{ whitelist: Whitelist; vesting: Vesting; presale: FirestarterPresale | ProjectPresale | Presale; }> {
    const whitelist = <Whitelist>await deployProxy("Whitelist");
    const vesting = <Vesting>await deployProxy("Vesting", addresses.rewardToken, vestingParams);
    const presale = <FirestarterPresale | ProjectPresale>await deployProxy(type, {
        ...addresses,
        whitelist: whitelist.address,
        vesting: vesting.address
    }, presaleParams);

    // set vesting owner to presale
    await vesting.init(presale.address);

    return { whitelist, vesting, presale }
}

export {
    verifyContract,
    deployContract,
    deployProxy,
    deployCampaign
}