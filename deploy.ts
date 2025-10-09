import {
  Wallet,
  Provider,
  WalletUnlocked,
  ContractFactory,
  hexlify,
  Contract,
} from 'fuels';
import fs from 'fs-extra';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  try {
    await doLoanReq()
    // const protocolAdminWallet = getProtocolAdminWallet();
    // console.log(`Protocol Admin Wallet: ${protocolAdminWallet.address}`);
    
    // const provider = await new Provider(
    //   'https://testnet.fuel.network/v1/graphql',
    // );
    // const protocolDeployer = process.env.PROTOCOL_DEPLOYER!;
    // const protocolDeployerWallet: WalletUnlocked =
    //   Wallet.fromMnemonic(protocolDeployer);
    // console.log(`Protocol Deployer Address: ${protocolDeployerWallet.address}`);
    // console.log(
    //   `-------------------------------------------------------------`,
    // );

    // protocolDeployerWallet.connect(provider);

    // const bytecode = fs.readFileSync('./out/debug/axios-fuel-core.bin');
    // const bytecodeHex = hexlify(bytecode);

    // const abi = fs.readJsonSync('./out/debug/axios-fuel-core-abi.json');
    // const factory = new ContractFactory(
    //   bytecodeHex,
    //   abi,
    //   protocolDeployerWallet,
    // );

    // const protocolOwner = process.env.PROTOCOL_OWNER!;
    // const protocolOwnerWallet: WalletUnlocked =
    //   Wallet.fromMnemonic(protocolOwner);
    // console.log(`Protocol Onwer Address: ${protocolOwnerWallet.address}`);
    // console.log(
    //   `-------------------------------------------------------------`,
    // );

    // factory.setConfigurableConstants({
    //   PROTOCOL_OWNER: { bits: protocolOwnerWallet.address.toB256() },
    // });

    // const tx = await factory.deploy();
    // const response = await tx.waitForResult();
    // console.log('Contract Id: ', response.contract.id.toString());
    // console.log(
    //   `-------------------------------------------------------------`,
    // );
    // const protocolAdminWallet = getProtocolAdminWallet();
    // console.log(`Protocol Admin Wallet: ${protocolAdminWallet.address}`);
    // await addProtocolAdmin(
    //   response.contract,
    //   getProtocolAdminWallet(),
    //   protocolOwnerWallet,
    // );
    // await updateProtocolConfigByAdmin(
    //   response.contract,
    //   getProtocolAdminWallet(),
    // );
  } catch (error) {
    console.log('logged error')
    console.error(error);
  }
}



async function userOne() {
   const privateKey = process.env.USER_ONE!;
   const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  );
  const wallet:WalletUnlocked = new WalletUnlocked(privateKey, provider)
  return wallet
}

async function addProtocolAdmin(
  contract: Contract,
  protocolAdminWallet: WalletUnlocked,
  protocolOwnerWallet: WalletUnlocked,
) {
  contract.account = protocolOwnerWallet;
  const provider = await getProviderForTestnet();
  protocolOwnerWallet.connect(provider);
  const tx = await contract.functions
    .add_admin({
      bits: protocolAdminWallet.address.toB256(),
    })
    .call();
  console.log(
    '---------------------------------------debug----------------------------------',
  );
}
async function updateProtocolConfigByAdmin(
  contract: Contract,
  protocolAdminWallet: WalletUnlocked,
) {
  contract.account = protocolAdminWallet;
  const provider = await getProviderForTestnet();
  protocolAdminWallet.connect(provider);
  console.log(`printf:1`);
  const tx = await contract.functions
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
  console.log(tx);
}
function getContractFactory(wallet: WalletUnlocked): ContractFactory<Contract> {
  const bytecode = fs.readFileSync('./out/debug/axios-fuel-core.bin');
  const bytecodeHex = hexlify(bytecode);

  const abi = fs.readJsonSync('./out/debug/axios-fuel-core-abi.json');
  const factory = new ContractFactory(bytecodeHex, abi, wallet);
  return factory;
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

function getContractId():string {
  const contractId = `0xeff0a0d9e58243ebc47fe91c84388a9e78782d18b55f1a5b06ad0fabe432ab29`
  return contractId
}

async function getContractInstance() {
  const wallet = getProtocolAdminWallet();
   const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  ); 
  wallet.connect(provider)
  const abi = fs.readJsonSync('./out/debug/axios-fuel-core-abi.json');
  const contractId = `0xeff0a0d9e58243ebc47fe91c84388a9e78782d18b55f1a5b06ad0fabe432ab29`;
  const contract = new Contract(contractId, abi, wallet);
  const result  = await contract.functions.protocol_config().get();
  console.log(await result.value);
}

async function setProtocolStatus() {  
 const wallet = getProtocolAdminWallet();
 const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  ); 
  wallet.connect(provider)
  const abi = fs.readJsonSync('./out/debug/axios-fuel-core-abi.json');
  const contractId = `0xeff0a0d9e58243ebc47fe91c84388a9e78782d18b55f1a5b06ad0fabe432ab29`;
  const contract = new Contract(contractId, abi, wallet);
  contract.account = wallet;
  console.log(`printf:1`);
  const tx = await contract.functions
    .update_protocol_status(false)
    .call();
  console.log(tx);
}

async function doLoanReq(){
  const ownerWallet = getProtocolOwnerWallet();
  const wallet = getProtocolAdminWallet();
  const callerWallet = await userOne();
  console.log('printf:0')
  const provider = await new Provider(
    'https://testnet.fuel.network/v1/graphql',
  ); 
  await callerWallet.connect(provider)
  const abi = fs.readJsonSync('./out/debug/axios-fuel-core-abi.json');
  const contractId = `0xeff0a0d9e58243ebc47fe91c84388a9e78782d18b55f1a5b06ad0fabe432ab29`;
  const contract = new Contract(contractId, abi, callerWallet);
  contract.account = callerWallet;
  console.log(`printf:1`);
  const tx = await contract.functions
    .request_loan({     
    borrower: {bits: callerWallet.address.toB256()},
    lender: {bits: ownerWallet.address.toB256()},
    asset: '0x324d0c35a4299ef88138a656d5272c5a3a9ccde2630ae055dacaf9d13443d53b',
    collateral: '0xF8f8b6283d7fa5B672b530Cbb84Fcccb4ff8dC40f8176eF4544dDB1f1952AD07',
    asset_amount: 1500,
    repayment_amount: 1700,
    collateral_amount: 10,
    created_timestamp: 0,
    start_timestamp: 0,
    duration: 37000,
    status: 0,
    liquidation: {      
       liquidation_request: false,
       liquidation_threshold_in_bps: 0,
       liquidation_flag_internal: false,
    },
    })
    .callParams({forward: [10, '0xF8f8b6283d7fa5B672b530Cbb84Fcccb4ff8dC40f8176eF4544dDB1f1952AD07']})
    .call();
  console.log(tx);
}


main();
