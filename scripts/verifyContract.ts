/* eslint-disable no-await-in-loop */
import { verifyContract } from "../helper/deployer";

async function main() {
    const impls: string[] = [
        "0x2b0937411369d21359a37c55d3df12096948c930",
    ];
    for (let i = 0; i < impls.length; i += 1) {
        await verifyContract(impls[i])
            .catch(() => {
                console.log("Failed to verify:", impls[i]);
            });
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
