import { Wallet, Provider, WalletUnlocked } from 'fuels';
import dotenv from 'dotenv';

import { AxiosFuelCoreFactory } from './types';
import { AxiosFuelCore } from './types';

dotenv.config();

// Oracle Address
const STORK_FUEL_TESTNET_ADDR =
  '0x09c88f50d535ac5ce8945e34c418233b1e3834be9a88effb57cb137321fbae0c';
// Oracle Asset Address Array
const ORACLE_FEED_ARR = [
  {
    assetName: 'fuel testnet',
    assetId:
      '0x324d0c35a4299ef88138a656d5272c5a3a9ccde2630ae055dacaf9d13443d53b',
    feedId:
      '0x670b7091d54af59331f97a1ce4a321eab14fd257a8b57b75ce4d4a5afc9186f4',
  },

  {
    assetName: 'usdc testnet',
    assetId:
      '0xc26c91055de37528492e7e97d91c6f4abe34aae26f2c4d25cff6bfe45b5dc9a9',
    feedId:
      '0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c',
  },

  {
    assetName: 'eth testnet',
    assetId:
      '0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07',
    feedId:
      '0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160',
  },

  {
    assetName: 'axios faucet testnet',
    assetId:
      '0x89707a636306ebf07cb7010e4201c14c5a86bd8c866504e3ce23538e60d6fdc7',
    feedId:
      '0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c',
  },
];

async function main() {
  try {
    const provider = await getProviderForTestnet();
    const protocolDeployer = process.env.PROTOCOL_DEPLOYER!;
    const protocolDeployerWallet: WalletUnlocked =
      Wallet.fromMnemonic(protocolDeployer);
    console.log(`Protocol Deployer Address: ${protocolDeployerWallet.address}`);
    console.log(
      `-------------------------------------------------------------`,
    );

    protocolDeployerWallet.connect(provider);

    const protocolOwner = process.env.PROTOCOL_OWNER!;
    const protocolOwnerWallet: WalletUnlocked =
      Wallet.fromMnemonic(protocolOwner);
    console.log(`Protocol Onwer Address: ${protocolOwnerWallet.address}`);
    console.log(
      `-------------------------------------------------------------`,
    );

    const configurableConstants = {
      PROTOCOL_OWNER: { bits: protocolOwnerWallet.address.toB256() },
    };

    const tx = await AxiosFuelCoreFactory.deploy(protocolDeployerWallet, {
      configurableConstants,
    });
    const response = await tx.waitForResult();
    console.log('Contract Id: ', response.contract.id.toString());
    console.log(
      `-------------------------------------------------------------`,
    );
    const protocolAdminWallet = getProtocolAdminWallet();
    console.log(`Protocol Admin Wallet: ${protocolAdminWallet.address}`);
    await addProtocolAdmin(
      getProtocolAdminWallet(),
      protocolOwnerWallet,
      response.contract.id.toString(),
    );
    await updateProtocolConfigByAdmin(
      getProtocolAdminWallet(),
      response.contract.id.toString(),
    );
    await setProtocolStatusByAdmin(
      getProtocolAdminWallet(),
      response.contract.id.toString(),
    );
    await setProtocolOracleByAdmin(
      getProtocolAdminWallet(),
      response.contract.id.toString(),
    );
    await setProtocolOracleFeedByAdmin(
      getProtocolAdminWallet(),
      response.contract.id.toString(),
    );
  } catch (error) {
    console.log('logged error');
    console.error(error);
  }
}

async function getContractInstanceWithProvidedWallet(
  wallet: WalletUnlocked,
  contractId: string,
) {
  const provider = await getProviderForTestnet();
  wallet.connect(provider);
  const contractInstance = await new AxiosFuelCore(contractId, wallet);
  return contractInstance;
}

async function userOne() {
  const privateKey = process.env.USER_ONE!;
  const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  );
  const wallet: WalletUnlocked = new WalletUnlocked(privateKey, provider);
  return wallet;
}

async function addProtocolAdmin(
  protocolAdminWallet: WalletUnlocked,
  protocolOwnerWallet: WalletUnlocked,
  contractId: string,
) {
  const contractInstance = await getContractInstanceWithProvidedWallet(
    protocolOwnerWallet,
    contractId,
  );
  const tx = await contractInstance.functions
    .add_admin({
      bits: protocolAdminWallet.address.toB256(),
    })
    .call();
  await tx.waitForResult();
  console.log(
    '---------------------------------------Admin Set By Owner----------------------------------',
  );
}

async function setProtocolStatusByAdmin(
  protocolAdminWallet: WalletUnlocked,
  contractId: string,
) {
  const contractInstance = await getContractInstanceWithProvidedWallet(
    protocolAdminWallet,
    contractId,
  );
  const tx = await contractInstance.functions
    .update_protocol_status(false)
    .call();
  await tx.waitForResult();
  console.log(
    `------------------------debug------------------------------------------`,
  );
}

async function setProtocolOracleFeedByAdmin(
  protocolAdminWallet: WalletUnlocked,
  contractId: string,
) {
  const contractInstance = await getContractInstanceWithProvidedWallet(
    protocolAdminWallet,
    contractId,
  );
  const oracleArr = ORACLE_FEED_ARR;
  for (let i = 0; i < oracleArr.length; i++) {
    const tx = await contractInstance.functions
      .update_oracle_feed_id(oracleArr[i].assetId, oracleArr[i].feedId)
      .call();
    await tx.waitForResult();
    console.log(`Added asset ${oracleArr[i].assetName} oracle feed`);
  }
  console.log(
    `------------------------Oracle Feed Pair Set By Admin------------------------------------------`,
  );
}

async function setProtocolOracleByAdmin(
  protocolAdminWallet: WalletUnlocked,
  contractId: string,
) {
  const storkTestnetAddr = STORK_FUEL_TESTNET_ADDR;
  const contractInstance = await getContractInstanceWithProvidedWallet(
    protocolAdminWallet,
    contractId,
  );
  const tx = await contractInstance.functions
    .update_oracle_contract(storkTestnetAddr)
    .call();
  await tx.waitForResult();
  console.log(
    `------------------------STORK Oracle Added By Admin------------------------------------------`,
  );
}

async function updateProtocolConfigByAdmin(
  protocolAdminWallet: WalletUnlocked,
  contractId: string,
) {
  const contractInstance = await getContractInstanceWithProvidedWallet(
    protocolAdminWallet,
    contractId,
  );
  const tx = await contractInstance.functions
    .update_protocol_config({
      protocol_fee_receiver: { bits: protocolAdminWallet.address.toB256() },
      protocol_fee: 100,
      protocol_liquidation_fee: 100,
      liquidator_fee: 100,
      time_request_loan_expires: 28800,
      oracle_max_stale: 30,
      min_loan_duration: 600,
    })
    .call();
  await tx.waitForResult();
  console.log(
    `----------------------------------Protocol Config Set By Admin --------------------------------`,
  );
}
async function getProviderForTestnet(): Promise<Provider> {
  const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  );
  return provider;
}

function getProtocolDeployerWallet(): WalletUnlocked {
  const protocolDeployer = process.env.PROTOCOL_DEPLOYER!;
  const protocolDeployerWallet: WalletUnlocked =
    Wallet.fromMnemonic(protocolDeployer);
  return protocolDeployerWallet;
}

function getProtocolOwnerWallet(): WalletUnlocked {
  const protocolOwner = process.env.PROTOCOL_OWNER!;
  const protocolOwnerWallet: WalletUnlocked =
    Wallet.fromMnemonic(protocolOwner);
  return protocolOwnerWallet;
}

function getProtocolAdminWallet(): WalletUnlocked {
  const protocolAdmin = process.env.PROTOCOL_ADMIN!;
  const protocolAdminWallet: WalletUnlocked =
    Wallet.fromMnemonic(protocolAdmin);
  return protocolAdminWallet;
}

// async function doLoanReq(){
//   const ownerWallet = getProtocolOwnerWallet();
//   const wallet = getProtocolAdminWallet();
//   const callerWallet = await userOne();
//   const contractInstance = await getContractInstanceWithProvidedWallet(callerWallet);
//   contractInstance.account = callerWallet;
//   const tx = await contractInstance.functions
//     .request_loan({
//     borrower: {bits: callerWallet.address.toB256()},
//     lender: {bits: ownerWallet.address.toB256()},
//     asset: '0x324d0c35a4299ef88138a656d5272c5a3a9ccde2630ae055dacaf9d13443d53b',
//     collateral: '0xF8f8b6283d7fa5B672b530Cbb84Fcccb4ff8dC40f8176eF4544dDB1f1952AD07',
//     asset_amount: 1500,
//     repayment_amount: 1700,
//     collateral_amount: 10,
//     created_timestamp: 0,
//     start_timestamp: 0,
//     duration: 37000,
//     status: 0,
//     liquidation: {
//        liquidation_threshold_in_bps: 0,
//        liquidation_flag_internal: false,
//     },
//     })
//     .callParams({forward: [10, '0xF8f8b6283d7fa5B672b530Cbb84Fcccb4ff8dC40f8176eF4544dDB1f1952AD07']})
//     .call();
//   await tx.waitForResult();
//   console.log(tx)
// }

// async function getProtocolStatus() {
//   const userOneWallet = await userOne();
//   const contractInstance = await getContractInstanceWithProvidedWallet(userOneWallet);
//   const {value} = await contractInstance.functions.protocol_status().get();
//   console.log(value)
// }

// async function getProtocolConfig() {
//   const userOneWallet = await userOne();
//   const contractInstance = await getContractInstanceWithProvidedWallet(userOneWallet);
//   const {value} = await contractInstance.functions.protocol_config().get();
//   console.log(value)
// }

main();
