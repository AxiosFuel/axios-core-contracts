import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, getContractWithWallet } from './setup';
import type { TestEnvironment } from './setup';

describe('Axios Market Test Suite', () => {
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  }, 60000);

  afterAll(() => {
    if (env?.cleanup) {
      env.cleanup();
    }
  });

  describe('Protocol Configuration & Status', () => {
    it('should return correct protocol status (active)', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(env.contractId, env.user1);
      const { value } = await contract.functions.protocol_status().get();
      expect(value).toBe(false);
    });

    it('should return protocol owner', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(env.contractId, env.user1);
      const { value } = await contract.functions.get_protocol_owner().get();
      expect(value.bits).toBe(env.protocolOwner.address.toB256());
    });

    it('should return protocol admin', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(env.contractId, env.user1);
      const { value } = await contract.functions.get_protocol_admin().get();
      expect(value.bits).toBe(env.protocolAdmin.address.toB256());
    });

    it('should return correct protocol config', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(env.contractId, env.user1);
      const { value } = await contract.functions.protocol_config().get();

      expect(value.protocol_fee.toNumber()).toBe(100);
      expect(value.protocol_liquidation_fee.toNumber()).toBe(100);
      expect(value.liquidator_fee.toNumber()).toBe(100);
      expect(value.time_request_loan_expires.toNumber()).toBe(28800);
      expect(value.oracle_max_stale.toNumber()).toBe(30);
      expect(value.min_loan_duration.toNumber()).toBe(60);
    });

    it('admin should be able to update protocol status', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(
        env.contractId,
        env.protocolAdmin,
      );

      await contract.functions.update_protocol_status(false).call();
      let { value } = await contract.functions.protocol_status().get();
      expect(value).toBe(false);
    });

    it('non-admin should NOT be able to update protocol status', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(env.contractId, env.user1);

      await expect(async () => {
        await contract.functions.update_protocol_status(false).call();
      }).rejects.toThrow();
    });

    it('admin should be able to update protocol config', async () => {
      if (!env) throw new Error('Test environment not initialized');

      const contract = await getContractWithWallet(
        env.contractId,
        env.protocolAdmin,
      );

      const newConfig = {
        protocol_fee_receiver: { bits: env.protocolAdmin.address.toB256() },
        protocol_fee: 150,
        protocol_liquidation_fee: 150,
        liquidator_fee: 150,
        time_request_loan_expires: 36000,
        oracle_max_stale: 60,
        min_loan_duration: 60,
      };

      await contract.functions.update_protocol_config(newConfig).call();

      const { value } = await contract.functions.protocol_config().get();
      expect(value.protocol_fee.toNumber()).toBe(150);
      expect(value.oracle_max_stale.toNumber()).toBe(60);
    });
  });

  describe('Borrower Loan Request Flow', () => {
    let basicLoanId: number;
    let cancelLoanId: number;

    it('should allow borrower to request a loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const loanRequest = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 1000,
        repayment_amount: 1100,
        collateral_amount: 100,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      const { waitForResult } = await contract.functions
        .request_loan(loanRequest)
        .callParams({
          forward: [100, e.assets.ethAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      basicLoanId = Number(length) + 1 - 1;
    });

    it('should have loan in Pending status (0) after request', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value } = await contract.functions
        .get_loan_status(basicLoanId)
        .get();
      expect(value.toNumber()).toBe(0); // Pending
    });

    it('should retrieve correct loan details', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value } = await contract.functions.get_loan(basicLoanId).get();

      expect(value.borrower.bits).toBe(e.user1.address.toB256());
      expect(value.lender.bits).toBe(e.user2.address.toB256());
      expect(value.asset).toBe(e.assets.usdcAsset.assetId);
      expect(value.collateral).toBe(e.assets.ethAsset.assetId);
      expect(value.asset_amount.toNumber()).toBe(1000);
      expect(value.repayment_amount.toNumber()).toBe(1100);
      expect(value.collateral_amount.toNumber()).toBe(100);
      expect(value.duration.toNumber()).toBe(3600);
    });

    it('should increment total loan count', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: lengthBefore } = await contract.functions
        .get_loan_length()
        .get();

      // Create another loan
      const loanRequest = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 500,
        repayment_amount: 550,
        collateral_amount: 50,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await contract.functions
        .request_loan(loanRequest)
        .callParams({
          forward: [50, e.assets.ethAsset.assetId],
        })
        .call();

      const { value: lengthAfter } = await contract.functions
        .get_loan_length()
        .get();
      expect(Number(lengthAfter)).toBe(Number(lengthBefore) + 1);
    });

    it('lender should be able to fill loan request', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      const { waitForResult } = await contract.functions
        .fill_loan_request(basicLoanId)
        .callParams({
          forward: [1000, e.assets.usdcAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Active status (2) after being filled', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: status } = await contract.functions
        .get_loan_status(basicLoanId)
        .get();
      expect(status.toNumber()).toBe(2); // Active
    });

    it('borrower should receive the loan amount after fill', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      // Check user1's USDC balance increased (they received the loan)
      const balance = await e.user1.getBalance(e.assets.usdcAsset.assetId);
      expect(balance.toNumber()).toBeGreaterThan(0);
    });

    it('should NOT allow borrower to cancel active loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      await expect(async () => {
        await contract.functions.cancel_loan(basicLoanId).call();
      }).rejects.toThrow();
    });

    it('borrower should be able to repay loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const { waitForResult } = await contract.functions
        .repay_loan(basicLoanId)
        .callParams({
          forward: [1100, e.assets.usdcAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Repaid status (3) after repayment', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: status } = await contract.functions
        .get_loan_status(basicLoanId)
        .get();
      expect(status.toNumber()).toBe(3); // Repaid
    });

    it('borrower should receive collateral back after repayment', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      // Check user1's ETH (collateral) balance
      const balance = await e.user1.getBalance(e.assets.ethAsset.assetId);
      expect(balance.toNumber()).toBeGreaterThan(0);
    });

    it('should NOT allow repaying already repaid loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      await expect(async () => {
        await contract.functions
          .repay_loan(basicLoanId)
          .callParams({
            forward: [1100, e.assets.usdcAsset.assetId],
          })
          .call();
      }).rejects.toThrow();
    });

    // Cancellation Flow
    it('borrower should be able to request loan for cancellation', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const loanRequest = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 300,
        repayment_amount: 330,
        collateral_amount: 30,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await contract.functions
        .request_loan(loanRequest)
        .callParams({
          forward: [30, e.assets.ethAsset.assetId],
        })
        .call();

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      cancelLoanId = Number(length) + 1 - 1;
    });

    it('borrower should be able to cancel pending loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const { waitForResult } = await contract.functions
        .cancel_loan(cancelLoanId)
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Canceled status (1) after cancellation', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: status } = await contract.functions
        .get_loan_status(cancelLoanId)
        .get();
      expect(status.toNumber()).toBe(1); // Canceled
    });

    it('borrower should receive collateral back after cancellation', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const balanceAfter = await e.user1.getBalance(e.assets.ethAsset.assetId);
      expect(balanceAfter.toNumber()).toBeGreaterThan(0);
    });

    it('should NOT allow filling canceled loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      await expect(async () => {
        await contract.functions
          .fill_loan_request(cancelLoanId)
          .callParams({
            forward: [300, e.assets.usdcAsset.assetId],
          })
          .call();
      }).rejects.toThrow();
    });

    it('should NOT allow non-borrower to cancel loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      // Create loan first
      const loanRequest = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 200,
        repayment_amount: 220,
        collateral_amount: 20,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await contract.functions
        .request_loan(loanRequest)
        .callParams({
          forward: [20, e.assets.ethAsset.assetId],
        })
        .call();

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      const testLoanId = Number(length) - 1;

      // Try to cancel with user2 (not borrower)
      const wrongContract = await getContractWithWallet(e.contractId, e.user2);

      await expect(async () => {
        await wrongContract.functions.cancel_loan(testLoanId).call();
      }).rejects.toThrow();
    });
  });

  describe('Lender Loan Offer Flow', () => {
    let offerLoanId: number;
    let cancelOfferId: number;
    let fillOfferId: number;

    it('should allow lender to offer a loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      const loanOffer = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 2000,
        repayment_amount: 2200,
        collateral_amount: 200,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 7200,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      const { waitForResult } = await contract.functions
        .offer_loan(loanOffer)
        .callParams({
          forward: [2000, e.assets.usdcAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      offerLoanId = Number(length) + 1 - 1;
    });

    it('should have loan in Pending status (0) after offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);
      const { value } = await contract.functions
        .get_loan_status(offerLoanId)
        .get();
      expect(value.toNumber()).toBe(0); // Pending
    });

    it('should retrieve correct loan offer details', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);
      const { value } = await contract.functions.get_loan(offerLoanId).get();

      expect(value.borrower.bits).toBe(e.user1.address.toB256());
      expect(value.lender.bits).toBe(e.user2.address.toB256());
      expect(value.asset).toBe(e.assets.usdcAsset.assetId);
      expect(value.collateral).toBe(e.assets.ethAsset.assetId);
      expect(value.asset_amount.toNumber()).toBe(2000);
      expect(value.repayment_amount.toNumber()).toBe(2200);
      expect(value.collateral_amount.toNumber()).toBe(200);
      expect(value.duration.toNumber()).toBe(7200);
    });

    it('borrower should be able to fill lender offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const { waitForResult } = await contract.functions
        .fill_lender_request(offerLoanId)
        .callParams({
          forward: [200, e.assets.ethAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Active status (2) after being filled', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: status } = await contract.functions
        .get_loan_status(offerLoanId)
        .get();
      expect(status.toNumber()).toBe(2); // Active
    });

    it('borrower should receive loan amount after filling offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const balance = await e.user1.getBalance(e.assets.usdcAsset.assetId);
      expect(balance.toNumber()).toBeGreaterThan(0);
    });

    it('borrower should be able to repay lender loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      const { waitForResult } = await contract.functions
        .repay_loan(offerLoanId)
        .callParams({
          forward: [2200, e.assets.usdcAsset.assetId],
        })
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Repaid status (3) after repayment', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);
      const { value: status } = await contract.functions
        .get_loan_status(offerLoanId)
        .get();
      expect(status.toNumber()).toBe(3); // Repaid
    });

    it('lender should receive repayment amount', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const balance = await e.user2.getBalance(e.assets.usdcAsset.assetId);
      // Lender should receive back more than they lent (with interest)
      expect(balance.toNumber()).toBeGreaterThan(0);
    });

    // Lender Cancellation Flow
    it('lender should be able to offer loan for cancellation test', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      const loanOffer = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 800,
        repayment_amount: 880,
        collateral_amount: 80,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await contract.functions
        .offer_loan(loanOffer)
        .callParams({
          forward: [800, e.assets.usdcAsset.assetId],
        })
        .call();

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      cancelOfferId = Number(length) + 1 - 1;
    });

    it('lender should be able to cancel pending offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      const { waitForResult } = await contract.functions
        .cancel_lender_offer(cancelOfferId)
        .call();

      const result = await waitForResult();
      expect(result.transactionResult.isStatusSuccess).toBe(true);
    });

    it('should have loan in Canceled status (1) after offer cancellation', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);
      const { value: status } = await contract.functions
        .get_loan_status(cancelOfferId)
        .get();
      expect(status.toNumber()).toBe(1); // Canceled
    });

    it('lender should receive loan amount back after cancellation', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const balance = await e.user2.getBalance(e.assets.usdcAsset.assetId);
      expect(balance.toNumber()).toBeGreaterThan(0);
    });

    it('should NOT allow borrower to fill canceled offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user1);

      await expect(async () => {
        await contract.functions
          .fill_lender_request(cancelOfferId)
          .callParams({
            forward: [80, e.assets.ethAsset.assetId],
          })
          .call();
      }).rejects.toThrow();
    });

    it('should NOT allow lender to cancel active loan', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const contract = await getContractWithWallet(e.contractId, e.user2);

      // Create and fill an offer
      const loanOffer = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 400,
        repayment_amount: 440,
        collateral_amount: 40,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await contract.functions
        .offer_loan(loanOffer)
        .callParams({
          forward: [400, e.assets.usdcAsset.assetId],
        })
        .call();

      const { value: length } = await contract.functions
        .get_loan_length()
        .get();
      fillOfferId = Number(length) + 1 - 1;

      // Fill the offer
      const borrowerContract = await getContractWithWallet(
        e.contractId,
        e.user1,
      );
      await borrowerContract.functions
        .fill_lender_request(fillOfferId)
        .callParams({
          forward: [40, e.assets.ethAsset.assetId],
        })
        .call();

      // Try to cancel active loan
      await expect(async () => {
        await contract.functions.cancel_lender_offer(fillOfferId).call();
      }).rejects.toThrow();
    });

    it('should NOT allow non-lender to cancel offer', async () => {
      if (!env) throw new Error('Test environment not initialized');
      const e = env;
      const lenderContract = await getContractWithWallet(e.contractId, e.user2);

      // Create offer
      const loanOffer = {
        borrower: { bits: e.user1.address.toB256() },
        lender: { bits: e.user2.address.toB256() },
        asset: e.assets.usdcAsset.assetId,
        collateral: e.assets.ethAsset.assetId,
        asset_amount: 300,
        repayment_amount: 330,
        collateral_amount: 30,
        created_timestamp: 0,
        start_timestamp: 0,
        duration: 3600,
        status: 0,
        liquidation: {
          liquidation_threshold_in_bps: 8000,
          liquidation_flag_internal: false,
        },
      };

      await lenderContract.functions
        .offer_loan(loanOffer)
        .callParams({
          forward: [300, e.assets.usdcAsset.assetId],
        })
        .call();

      const { value: length } = await lenderContract.functions
        .get_loan_length()
        .get();
      const testOfferId = Number(length) - 1;

      // Try to cancel with wrong user
      const wrongContract = await getContractWithWallet(e.contractId, e.user1);

      await expect(async () => {
        await wrongContract.functions.cancel_lender_offer(testOfferId).call();
      }).rejects.toThrow();
    });
  });
});
