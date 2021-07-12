import hre, { ethers } from "hardhat";

export async function impersonateAccount(account: string) {
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [account]}
    );
}

export async function stopImpersonatingAccount(account: string) {
    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [account]}
    );
}

export async function setNextBlockTimestamp(timestamp: number) {
    await hre.network.provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [timestamp]}
    );
}

export async function getLatestBlockTimestamp() {
    return (await ethers.provider.getBlock("latest")).timestamp;
}

export function getSelectors(contract: any) {
    const selectors = Object.keys(contract.interface.functions).map(v => ethers.utils.id(v).slice(0, 10));
    return selectors;
}
