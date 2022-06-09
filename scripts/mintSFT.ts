import { ethers } from "hardhat";
import { FirestarterSft } from "../typechain";
import { parse } from "csv-parse";
import fs from "fs";

interface CSVData {
  address: string;
  amount: string;
  unset: boolean;
}

async function main() {
  const firestarterSftAddress = "";
  const csvPath = ""; // ./scripts/data.csv
  const checkMinted = true;
  const splits = 200;

  const firestarterSft = <FirestarterSft>(
    await ethers.getContractAt("FirestarterSFT", firestarterSftAddress)
  );

  const csvData: CSVData[] = [];
  const fd = fs.createReadStream(csvPath).pipe(parse({ columns: true }));

  const streamPromise = new Promise(function (resolve, reject) {
    fd.on("data", function (csvrow) {
      csvData.push({
        address: csvrow.address,
        amount: csvrow.amount,
        unset: csvrow.unset === "true",
      });
    });
    fd.on("end", () => resolve(csvData));
    fd.on("error", reject);
  });

  await streamPromise;

  for (let i = 0; i < csvData.length; i++) {
    const { address, amount, unset } = csvData[i];
    if (!ethers.utils.isAddress(address)) {
      console.log("Invalid Ethereum Address at line ", i);
      return;
    }

    if (unset && amount !== "0") {
      console.log("The amount must be zero when unset flag is true at line", i);
      return;
    }
  }

  let dataToMint: CSVData[] = [];

  if (!checkMinted) {
    dataToMint = checkMinted;
  } else {
    for (let i = 0; i < csvData.length; i++) {
      const eventFilter = firestarterSft.filters.Transfer(
        "0x0000000000000000000000000000000000000000",
        csvData[i].address,
        null
      );
      const events = await firestarterSft.queryFilter(eventFilter);
      if (events.length === 0) {
        dataToMint.push(csvData[i]);
      } else {
        const block = await events[0].getBlock();
        if (Date.now() / 1000 - block.timestamp > 3600 * 8) {
          dataToMint.push(csvData[i]);
        }
      }
    }
  }

  for (let i = 0; i < dataToMint.length; i += splits) {
    const end = dataToMint.length > i + splits ? i + splits : dataToMint.length;
    const users = dataToMint.slice(i, end).map((el) => el.address);
    const amounts = dataToMint.slice(i, end).map((el) => el.amount);
    const unsets = dataToMint.slice(i, end).map((el) => el.unset);

    console.log(`minting from ${i} to ${end}`);
    await firestarterSft.batchMint(users, amounts, unsets);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
