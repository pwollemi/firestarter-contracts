import hre, { ethers } from "hardhat";

export async function impersonateAccount(account: string) : Promise<void> {
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [account]}
    );
}

export async function stopImpersonatingAccount(account: string) : Promise<void> {
    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [account]}
    );
}

export async function setNextBlockTimestamp(timestamp: number) : Promise<void> {
    await hre.network.provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [timestamp]}
    );
}

export async function mineBlock() : Promise<void> {
    await hre.network.provider.request({
        method: "evm_mine"
    });
}

export async function getLatestBlockTimestamp() : Promise<number> {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

export function getSelectors(contract: any) : string[] {
    const selectors = Object.keys(contract.interface.functions).map(v => ethers.utils.id(v).slice(0, 10));
    return selectors;
}
