import { WalletUnlocked, Provider } from 'fuels';
import { launchTestNode, TestAssetId } from 'fuels/test-utils';
import { AxiosFuelCoreFactory, AxiosFuelCore } from '../types';

export const TEST_TIMEOUT = 60000;
export const INITIAL_AMOUNT = 10_000_000;

// Mock Oracle Configuration
export const MOCK_ORACLE_ADDRESS =
  '0x09c88f50d535ac5ce8945e34c418233b1e3834be9a88effb57cb137321fbae0c';

// Test Assets Configuration
export interface TestMarketAssets {
  fuelAsset: { assetId: string; feedId: string; name: string };
  usdcAsset: { assetId: string; feedId: string; name: string };
  ethAsset: { assetId: string; feedId: string; name: string };
  collateralAsset: { assetId: string; feedId: string; name: string };
}

export interface TestEnvironment {
  provider: Provider;
  protocolOwner: WalletUnlocked;
  protocolAdmin: WalletUnlocked;
  user1: WalletUnlocked;
  user2: WalletUnlocked;
  contract: AxiosFuelCore;
  contractId: string;
  assets: TestMarketAssets;
  cleanup: () => void;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
  // random test asset IDs
  const [fuelAssetId] = TestAssetId.random();
  const [usdcAssetId] = TestAssetId.random();
  const [ethAssetId] = TestAssetId.random();
  const [collateralAssetId] = TestAssetId.random();

  // corresponding feed IDs (mock)
  const fuelFeedId =
    '0x670b7091d54af59331f97a1ce4a321eab14fd257a8b57b75ce4d4a5afc9186f4';
  const usdcFeedId =
    '0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c';
  const ethFeedId =
    '0x59102b37de83bdda9f38ac8254e596f0d9ac61d2035c07936675e87342817160';
  const collateralFeedId =
    '0x7416a56f222e196d0487dce8a1a8003936862e7a15092a91898d69fa8bce290c';

  const assets: TestMarketAssets = {
    fuelAsset: {
      assetId: fuelAssetId.value,
      feedId: fuelFeedId,
      name: 'FUEL Test',
    },
    usdcAsset: {
      assetId: usdcAssetId.value,
      feedId: usdcFeedId,
      name: 'USDC Test',
    },
    ethAsset: {
      assetId: ethAssetId.value,
      feedId: ethFeedId,
      name: 'ETH Test',
    },
    collateralAsset: {
      assetId: collateralAssetId.value,
      feedId: collateralFeedId,
      name: 'Collateral Test',
    },
  };
  const launched = await launchTestNode({
    walletsConfig: {
      count: 4,
      assets: [fuelAssetId, usdcAssetId, ethAssetId, collateralAssetId],
      coinsPerAsset: 4,
      amountPerCoin: INITIAL_AMOUNT,
    },
  });

  const {
    provider,
    wallets: [protocolOwner, protocolAdmin, user1, user2],
  } = launched;

  console.log(`Protocol Owner Address: ${protocolOwner.address}`);
  console.log(`Protocol Admin Address: ${protocolAdmin.address}`);
  console.log(`User1 Address: ${user1.address}`);
  console.log(`User2 Address: ${user2.address}`);

  const configurableConstants = {
    PROTOCOL_OWNER: { bits: protocolOwner.address.toB256() },
  };

  const { waitForResult } = await AxiosFuelCoreFactory.deploy(protocolOwner, {
    configurableConstants,
  });

  const { contract } = await waitForResult();
  const contractId = contract.id.toString();

  console.log(`Contract deployed at: ${contractId}`);

  await initializeProtocol(contract, protocolOwner, protocolAdmin, assets);

  function cleanup() {
    launched.cleanup();
  }

  return {
    provider,
    protocolOwner,
    protocolAdmin,
    user1,
    user2,
    contract,
    contractId,
    assets,
    cleanup,
  };
}

async function initializeProtocol(
  contract: AxiosFuelCore,
  protocolOwner: WalletUnlocked,
  protocolAdmin: WalletUnlocked,
  assets: TestMarketAssets,
) {
  console.log('Initializing protocol...');

  // Add protocol admin
  await addProtocolAdmin(contract, protocolOwner, protocolAdmin);

  // Update protocol configuration
  await updateProtocolConfig(contract, protocolAdmin);

  // Set oracle contract
  await setProtocolOracle(contract, protocolAdmin);

  // Add all oracle feeds for assets
  await setOracleFeeds(contract, protocolAdmin, assets);

  // Enable trading (set protocol status to active)
  await setProtocolStatus(contract, protocolAdmin, false);

  console.log('Protocol initialization complete!');
}

async function addProtocolAdmin(
  contract: AxiosFuelCore,
  owner: WalletUnlocked,
  admin: WalletUnlocked,
) {
  const contractInstance = new AxiosFuelCore(contract.id.toString(), owner);

  const { waitForResult } = await contractInstance.functions
    .add_admin({ bits: admin.address.toB256() })
    .call();

  await waitForResult();
  console.log('✓ Admin added by owner');
}

async function updateProtocolConfig(
  contract: AxiosFuelCore,
  admin: WalletUnlocked,
) {
  const contractInstance = new AxiosFuelCore(contract.id.toString(), admin);

  const { waitForResult } = await contractInstance.functions
    .update_protocol_config({
      protocol_fee_receiver: { bits: admin.address.toB256() },
      protocol_fee: 100, // 1% (in basis points)
      protocol_liquidation_fee: 100,
      liquidator_fee: 100,
      time_request_loan_expires: 28800, // 8 hours
      oracle_max_stale: 30, // 30 seconds
      min_loan_duration: 60, // 10 minutes // keeping very short 60 for testing
    })
    .call();

  await waitForResult();
  console.log('✓ Protocol config updated by admin');
}

async function setProtocolOracle(
  contract: AxiosFuelCore,
  admin: WalletUnlocked,
) {
  const contractInstance = new AxiosFuelCore(contract.id.toString(), admin);

  const { waitForResult } = await contractInstance.functions
    .update_oracle_contract(MOCK_ORACLE_ADDRESS)
    .call();

  await waitForResult();
  console.log('✓ Oracle contract set by admin');
}

async function setOracleFeeds(
  contract: AxiosFuelCore,
  admin: WalletUnlocked,
  assets: TestMarketAssets,
) {
  const contractInstance = new AxiosFuelCore(contract.id.toString(), admin);

  const assetArray = [
    assets.fuelAsset,
    assets.usdcAsset,
    assets.ethAsset,
    assets.collateralAsset,
  ];

  for (const asset of assetArray) {
    const { waitForResult } = await contractInstance.functions
      .update_oracle_feed_id(asset.assetId, asset.feedId)
      .call();

    await waitForResult();
    console.log(
      `✓ Oracle feed added for ${asset.name} and assetId ${asset.assetId}`,
    );
  }

  console.log('✓ All oracle feeds configured');
}

async function setProtocolStatus(
  contract: AxiosFuelCore,
  admin: WalletUnlocked,
  status: boolean,
) {
  const contractInstance = new AxiosFuelCore(contract.id.toString(), admin);

  const { waitForResult } = await contractInstance.functions
    .update_protocol_status(status)
    .call();

  await waitForResult();
  console.log(`✓ Protocol status set to: ${status ? 'INACTIVE' : 'ACTIVE'}`);
}

export async function getContractWithWallet(
  contractId: string,
  wallet: WalletUnlocked,
): Promise<AxiosFuelCore> {
  return new AxiosFuelCore(contractId, wallet);
}

export async function checkWalletBalances(
  wallet: WalletUnlocked,
  assets: TestMarketAssets,
) {
  const balances = {
    fuel: await wallet.getBalance(assets.fuelAsset.assetId),
    usdc: await wallet.getBalance(assets.usdcAsset.assetId),
    eth: await wallet.getBalance(assets.ethAsset.assetId),
    collateral: await wallet.getBalance(assets.collateralAsset.assetId),
  };

  return balances;
}
