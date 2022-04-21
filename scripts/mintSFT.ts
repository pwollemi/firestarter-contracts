import { ethers } from "hardhat";
import { FirestarterSft } from "../typechain";
import { parse } from "csv-parse";
import fs from "fs";

interface CSVData {
  address: string;
  amount: string;
}

async function main() {
  const firestarterSftAddress = "";
  const csvPath = "./scripts/data.csv";
  const splits = 200;

  const firestarterSft = <FirestarterSft>(
    await ethers.getContractAt("FirestarterSft", firestarterSftAddress)
  );

  const csvData: CSVData[] = [];
  const fd = fs.createReadStream(csvPath).pipe(parse({ delimiter: ":" }));

  const streamPromise = new Promise(function (resolve, reject) {
    fd.on("data", function (csvrow) {
      csvData.push({
        address: (csvrow[0] as string).split(",")[0],
        amount: (csvrow[0] as string).split(",")[1],
      });
    });
    fd.on("end", () => resolve(csvData));
    fd.on("error", reject);
  });

  await streamPromise;

  for (let i = 0; i < csvData.length; i += splits) {
    const end = csvData.length > i + splits ? i + splits : csvData.length;
    const users = csvData.slice(i, end).map((el) => el.address);
    const amounts = csvData.slice(i, end).map((el) => el.amount);

    console.log(`minting from ${i} to ${end}`);
    await firestarterSft.batchMint(users, amounts);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
